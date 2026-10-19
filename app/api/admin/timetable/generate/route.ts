import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { DEFAULT_VENUE_RADIUS_M, TEACHING_SPACES, generateTimetable, type FixedAllocation, type GeneratorCourse, type GeneratorRoom } from "@/lib/timetableGenerator";
import { WEEKDAYS, isTimeRangeValid } from "@/lib/timetable";
import { acquireTimetableMutationLock, releaseTimetableMutationLock, renewTimetableMutationLock, type TimetableMutationLock } from "@/lib/timetableLock";
import { validateTimetableForPublishing } from "@/lib/timetableValidation";
import AuditEvent from "@/lib/database/models/AuditEvent";
import { recordAudit } from "@/lib/audit";

type GenerateInput = {
  academicYear?: string;
  semester?: string;
  department?: string;
  courseIds?: string[];
  dryRun?: boolean;
  publish?: boolean;
  replaceDrafts?: boolean;
  maxVenueRadiusM?: number;
  dayStart?: string;
  dayEnd?: string;
  includeSaturday?: boolean;
  maxStreams?: number;
};

const idOf = (value: unknown) => String((value as { _id?: unknown })?._id ?? value);

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: TimetableMutationLock | null = null;
  try {
    const body = (await request.json()) as GenerateInput;
    if (!body || typeof body !== "object" || typeof body.academicYear !== "string" || typeof body.semester !== "string" || !body.academicYear.trim() || !body.semester.trim()) return NextResponse.json({ error: "Academic year and semester are required." }, { status: 400 });
    body.academicYear = body.academicYear.trim();
    body.semester = body.semester.trim();
    const dayStart = body.dayStart || "08:00";
    const dayEnd = body.dayEnd || "18:00";
    if (typeof dayStart !== "string" || typeof dayEnd !== "string" || !isTimeRangeValid(dayStart, dayEnd)) return NextResponse.json({ error: "Provide a valid teaching day window." }, { status: 400 });
    const radius = Number(body.maxVenueRadiusM ?? DEFAULT_VENUE_RADIUS_M);
    const maxStreams = Number(body.maxStreams ?? 8);
    if ((body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
        (body.publish !== undefined && typeof body.publish !== "boolean") ||
        (body.replaceDrafts !== undefined && typeof body.replaceDrafts !== "boolean") ||
        (body.includeSaturday !== undefined && typeof body.includeSaturday !== "boolean")) {
      return NextResponse.json({ error: "Generation flags must be boolean values." }, { status: 400 });
    }
    if (!Number.isFinite(radius) || radius < 50 || radius > 5000) return NextResponse.json({ error: "Venue radius must be between 50 m and 5000 m." }, { status: 400 });
    if (!Number.isInteger(maxStreams) || maxStreams < 1 || maxStreams > 20) return NextResponse.json({ error: "Maximum streams must be between 1 and 20." }, { status: 400 });
    if (body.department !== undefined && body.department !== "" &&
        (typeof body.department !== "string" || !mongoose.isValidObjectId(body.department))) {
      return NextResponse.json({ error: "Invalid department id." }, { status: 400 });
    }
    if (body.courseIds !== undefined &&
        (!Array.isArray(body.courseIds) || body.courseIds.length === 0 || body.courseIds.length > 1000 ||
          body.courseIds.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id)))) {
      return NextResponse.json({ error: "Course ids must be a list of 1-1000 valid course ids." }, { status: 400 });
    }

    await connectToDatabase();
    if (!body.dryRun) {
      lock = await acquireTimetableMutationLock(body.academicYear, body.semester);
      if (!lock) return NextResponse.json({ error: "Another timetable change is in progress for this academic year and semester. Please retry shortly." }, { status: 409 });
    }
    const courseFilter = {
      active: true,
      semester: body.semester,
      ...(body.department ? { department: body.department } : {}),
      ...(body.courseIds?.length ? { _id: { $in: body.courseIds } } : {}),
    };
    const [courseDocs, roomDocs, existing] = await Promise.all([
      Course.find(courseFilter).populate("department", "code active").lean().then((courses) => courses.filter((course) => course.department?.active !== false)),
      Room.find().lean(),
      TimetableAllocation.find({ academicYear: body.academicYear, semester: body.semester, status: { $ne: "cancelled" } })
        .populate({ path: "course", select: "code level department", populate: { path: "department", select: "code" } })
        .lean(),
    ]);
    if (!courseDocs.length) return NextResponse.json({ error: "No active courses match this semester and selection." }, { status: 404 });

    const scopeIds = new Set(courseDocs.map((course) => idOf(course)));
    const replaceable = (allocation: (typeof existing)[number]) => body.replaceDrafts && allocation.autoGenerated && allocation.status === "draft" && scopeIds.has(idOf(allocation.course));
    const fixedDocs = existing.filter((allocation) => !replaceable(allocation));
    const roomIds = new Set(roomDocs.map((room) => idOf(room)));
    const invalidExisting = fixedDocs.find((allocation) =>
      !roomIds.has(idOf(allocation.room)) ||
      !WEEKDAYS.includes(allocation.dayOfWeek as (typeof WEEKDAYS)[number]) ||
      !isTimeRangeValid(allocation.startTime, allocation.endTime)
    );
    if (invalidExisting) {
      return NextResponse.json({ error: "Existing timetable data contains a missing venue or invalid day/time. Resolve it before generating this term." }, { status: 409 });
    }
    const relevantCourseIds = new Set([
      ...scopeIds,
      ...fixedDocs.map((allocation) => idOf(allocation.course)).filter((id) => mongoose.isValidObjectId(id)),
    ]);
    const studentDocs = await User.find({
      role: "student",
      status: "active",
      enrolledCourses: { $in: [...relevantCourseIds] },
    }).select("studentId enrolledCourses").sort({ studentId: 1 }).lean();

    const rooms: GeneratorRoom[] = roomDocs.map((room) => ({
      id: idOf(room), code: room.code, name: room.name, capacity: room.capacity || 0, latitude: room.latitude, longitude: room.longitude, available: room.isAvailable !== false, spaceType: room.spaceType || "lecture_room",
    }));
    const studentsByCourse = new Map<string, string[]>();
    for (const student of studentDocs) {
      for (const enrolledCourse of student.enrolledCourses || []) {
        const courseId = idOf(enrolledCourse);
        const list = studentsByCourse.get(courseId) || [];
        list.push(idOf(student));
        if (!studentsByCourse.has(courseId)) studentsByCourse.set(courseId, list);
      }
    }

    const allocationGroups = new Map<string, Map<string, (typeof fixedDocs)[number][]>>();
    for (const allocation of fixedDocs) {
      const courseId = idOf(allocation.course);
      const streamKey = allocation.stream || "";
      const groups = allocationGroups.get(courseId) || new Map<string, (typeof fixedDocs)[number][]>();
      groups.set(streamKey, [...(groups.get(streamKey) || []), allocation]);
      allocationGroups.set(courseId, groups);
    }

    const membersByAllocation = new Map<string, string[]>();
    const existingStreamsByCourse = new Map<string, GeneratorCourse["existingStreams"]>();
    const existingAllocationIdsByCourse = new Map<string, string[][]>();
    for (const [courseId, groups] of allocationGroups) {
      const roster = studentsByCourse.get(courseId) || [];
      const streamGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
      const knownMembers = new Set<string>();
      const resolved = streamGroups.map(([label, allocations]) => {
        const memberIds = [...new Set(allocations.flatMap((allocation) => (allocation.streamStudentIds || []).map(idOf)))];
        memberIds.forEach((id) => knownMembers.add(id));
        const size = Math.max(...allocations.map((allocation) => allocation.streamSize || 0));
        return { label, allocations, memberIds, size };
      });
      let cursor = 0;
      for (const stream of resolved) {
        if (stream.memberIds.length) continue;
        if (resolved.length === 1 && (!stream.size || stream.size >= roster.length)) {
          stream.memberIds = [...roster];
        } else {
          while (cursor < roster.length && knownMembers.has(roster[cursor])) cursor += 1;
          const inferred = roster.slice(cursor, cursor + stream.size);
          stream.memberIds = inferred;
          inferred.forEach((id) => knownMembers.add(id));
          cursor += inferred.length;
          if (!stream.label && resolved.length > 1) stream.label = `Stream ${String.fromCharCode(65 + resolved.indexOf(stream))}`;
        }
        stream.memberIds.forEach((id) => knownMembers.add(id));
      }
      const streams = resolved.map((stream) => ({
        label: stream.label,
        studentIds: stream.memberIds,
        scheduledSessions: stream.allocations.length,
        scheduledDays: [...new Set(stream.allocations.map((allocation) => allocation.dayOfWeek))],
        anchorRoomId: idOf(stream.allocations[0].room),
      }));
      if (scopeIds.has(courseId)) {
        existingStreamsByCourse.set(courseId, streams);
        existingAllocationIdsByCourse.set(courseId, resolved.map((stream) => stream.allocations.map(idOf)));
      }
      for (const stream of resolved) {
        for (const allocation of stream.allocations) membersByAllocation.set(idOf(allocation), stream.memberIds);
      }
    }

    const courses: GeneratorCourse[] = courseDocs.map((course) => ({
      id: idOf(course), code: course.code, title: course.title, departmentCode: course.department?.code || "DEPT", level: course.level, expectedEnrollment: course.expectedEnrollment,
      lecturer: course.lecturer, sessionsPerWeek: course.sessionsPerWeek || 2, sessionMinutes: course.sessionMinutes || 120, venueIds: (course.preferredVenues || []).map(idOf),
      preferredSpaceTypes: course.preferredSpaceTypes?.length ? course.preferredSpaceTypes : TEACHING_SPACES,
      studentIds: studentsByCourse.get(idOf(course)) || [],
      existingStreams: existingStreamsByCourse.get(idOf(course)),
    }));
    const fixed: FixedAllocation[] = fixedDocs.map((allocation) => ({
      courseId: idOf(allocation.course), roomId: idOf(allocation.room),
      group: allocation.cohort || `${allocation.course?.department?.code || "DEPT"} ${allocation.course?.level || ""}`.trim(),
      lecturer: allocation.lecturer, dayOfWeek: allocation.dayOfWeek, startTime: allocation.startTime, endTime: allocation.endTime, stream: allocation.stream || "",
      studentIds: allocation.streamStudentIds?.length ? allocation.streamStudentIds.map(idOf) : membersByAllocation.get(idOf(allocation)) || [],
    }));

    const result = generateTimetable(courses, rooms, fixed, {
      days: body.includeSaturday ? [...WEEKDAYS] : WEEKDAYS.filter((day) => day !== "Saturday"),
      dayStart, dayEnd, maxVenueRadiusM: radius, maxStreams,
    });
    const generatedStreamCounts = new Map<string, number>();
    for (const session of result.sessions) {
      generatedStreamCounts.set(session.courseId, Math.max(generatedStreamCounts.get(session.courseId) || 0, session.streamCount));
    }
    const fixedStreamLabels = new Map<string, string>();
    for (const course of courses) {
      const existingStreams = course.existingStreams || [];
      const streamCount = Math.max(existingStreams.length, generatedStreamCounts.get(course.id) || 0);
      existingStreams.forEach((stream, index) => {
        const label = stream.label || (streamCount > 1 ? `Stream ${String.fromCharCode(65 + index)}` : "");
        for (const allocationId of existingAllocationIdsByCourse.get(course.id)?.[index] || []) {
          fixedStreamLabels.set(allocationId, label);
        }
      });
    }

    const courseById = new Map(courses.map((course) => [course.id, course]));
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const preview = result.sessions.map((session) => ({
      ...session,
      studentIds: undefined,
      courseCode: courseById.get(session.courseId)?.code,
      courseTitle: courseById.get(session.courseId)?.title,
      roomCode: roomById.get(session.roomId)?.code,
      roomName: roomById.get(session.roomId)?.name,
      roomCapacity: roomById.get(session.roomId)?.capacity,
    }));

    if (body.publish && result.unscheduled.length) {
      return NextResponse.json({ error: "Publication is blocked because one or more courses have unplaced students or sessions.", unscheduled: result.unscheduled }, { status: 409 });
    }

    let saved = 0;
    if (!body.dryRun && !result.unscheduled.length && (result.sessions.length > 0 || body.publish)) {
      const departmentByCourse = new Map(courseDocs.map((course) => [idOf(course), idOf(course.department)]));
      const documents = result.sessions.map((session) => ({
        academicYear: body.academicYear,
        semester: body.semester,
        department: departmentByCourse.get(session.courseId),
        course: session.courseId,
        room: session.roomId,
        cohort: session.group,
        lecturer: session.lecturer?.trim(),
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        status: body.publish ? "published" : "draft",
        stream: session.stream,
        streamSize: session.streamSize,
        streamCount: session.streamCount,
        autoGenerated: true,
        streamStudentIds: session.studentIds,
        notes: session.streamCount > 1 ? `${session.stream}: ${session.streamSize} students` : undefined,
      }));
      if (body.publish) {
        const publishCourses = courseDocs.map((course) => ({
          id: idOf(course),
          code: course.code,
          sessionsPerWeek: course.sessionsPerWeek || 2,
          sessionMinutes: course.sessionMinutes || 120,
          preferredVenues: (course.preferredVenues || []).map(idOf),
          preferredSpaceTypes: course.preferredSpaceTypes?.length ? course.preferredSpaceTypes : TEACHING_SPACES,
        }));
        const publishAllocations = [
          ...fixedDocs.map((allocation) => ({
            id: idOf(allocation),
            courseId: idOf(allocation.course),
            roomId: idOf(allocation.room),
            cohort: allocation.cohort,
            lecturer: allocation.lecturer || "",
            dayOfWeek: allocation.dayOfWeek,
            startTime: allocation.startTime,
            endTime: allocation.endTime,
            stream: fixedStreamLabels.get(idOf(allocation)) ?? allocation.stream ?? "",
            streamSize: allocation.streamSize || membersByAllocation.get(idOf(allocation))?.length || 0,
            studentIds: allocation.streamStudentIds?.length
              ? allocation.streamStudentIds.map(idOf)
              : membersByAllocation.get(idOf(allocation)) || [],
          })),
          ...documents.map((allocation, index) => ({
            id: `generated-${index}`,
            courseId: String(allocation.course),
            roomId: String(allocation.room),
            cohort: allocation.cohort,
            lecturer: allocation.lecturer || "",
            dayOfWeek: allocation.dayOfWeek,
            startTime: allocation.startTime,
            endTime: allocation.endTime,
            stream: allocation.stream,
            streamSize: allocation.streamSize,
            studentIds: allocation.streamStudentIds.map(String),
          })),
        ];
        const validationErrors = validateTimetableForPublishing(
          publishCourses,
          publishAllocations,
          rooms,
          studentsByCourse,
          radius
        );
        if (validationErrors.length) {
          return NextResponse.json({ error: "Publication is blocked until the timetable is complete and conflict-free.", details: validationErrors }, { status: 409 });
        }
      }
      const dbSession = await mongoose.startSession();
      try {
        await AuditEvent.init();
        if (lock) await renewTimetableMutationLock(lock);
        await dbSession.withTransaction(async () => {
          if (body.replaceDrafts) {
            await TimetableAllocation.deleteMany({ academicYear: body.academicYear, semester: body.semester, autoGenerated: true, status: "draft", course: { $in: [...scopeIds] } }).session(dbSession);
          }
          const streamLabelUpdates = fixedDocs.flatMap((allocation) => {
            const label = fixedStreamLabels.get(idOf(allocation));
            return label !== undefined && label !== (allocation.stream || "")
              ? [{ updateOne: { filter: { _id: allocation._id }, update: { $set: { stream: label } } } }]
              : [];
          });
          if (streamLabelUpdates.length) await TimetableAllocation.bulkWrite(streamLabelUpdates, { session: dbSession });
          if (documents.length) await TimetableAllocation.insertMany(documents, { session: dbSession });
          if (body.publish) {
            const promoted = await TimetableAllocation.updateMany(
              { academicYear: body.academicYear, semester: body.semester, course: { $in: [...scopeIds] }, status: "draft" },
              { $set: { status: "published" } },
              { session: dbSession }
            );
            saved = documents.length + promoted.modifiedCount;
          } else {
            saved = documents.length;
          }
          await recordAudit(dbSession, access.session.user.id, body.publish ? "timetable.publish" : "timetable.draft", `${body.academicYear}|${body.semester}`, {
            courseCount: String(scopeIds.size), saved: String(saved),
          });
        });
      } finally {
        await dbSession.endSession();
      }
    }

    return NextResponse.json({ result: { ...result, sessions: preview }, saved, dryRun: Boolean(body.dryRun), publicationBlocked: result.unscheduled.length > 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate the timetable." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableMutationLock(lock);
  }
}
