import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { isTimeRangeValid, rangesOverlap, timeToMinutes, WEEKDAYS } from "@/lib/timetable";
import { distanceMeters } from "@/lib/timetableGenerator";
import { acquireTimetableMutationLock, releaseTimetableMutationLock, renewTimetableMutationLock, type TimetableMutationLock } from "@/lib/timetableLock";
import { validateTimetableForPublishing } from "@/lib/timetableValidation";
import { auditedMutation } from "@/lib/audit";

type AllocationInput = {
  id?: string;
  academicYear?: string;
  semester?: string;
  department?: string;
  course?: string;
  room?: string;
  cohort?: string;
  lecturer?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  notes?: string;
  stream?: string;
  studentIds?: string[];
};

async function findConflict(input: AllocationInput, studentIds: string[]) {
  const candidates = await TimetableAllocation.find({
    ...(input.id ? { _id: { $ne: input.id } } : {}),
    academicYear: input.academicYear,
    semester: input.semester,
    dayOfWeek: input.dayOfWeek,
    status: { $ne: "cancelled" },
  }).lean();
  const courseIds = [...new Set(candidates.map((candidate) => String(candidate.course)))];
  const legacyEnrollments = courseIds.length ? await User.find({
    role: "student",
    status: "active",
    enrolledCourses: { $in: courseIds },
  }).select("_id enrolledCourses").lean() : [];
  const legacyByCourse = new Map<string, string[]>();
  for (const student of legacyEnrollments) {
    for (const courseId of student.enrolledCourses || []) {
      const key = String(courseId);
      const members = legacyByCourse.get(key);
      if (members) members.push(String(student._id));
      else legacyByCourse.set(key, [String(student._id)]);
    }
  }
  const roomIds = [...new Set([input.room || "", ...candidates.map((candidate) => String(candidate.room))])];
  const roomDocs = await Room.find({ _id: { $in: roomIds } }).select("latitude longitude").lean();
  const roomsById = new Map(roomDocs.map((room) => [String(room._id), room]));
  const requestedStudents = new Set(studentIds);
  const requestedStart = timeToMinutes(input.startTime || "");
  const requestedEnd = timeToMinutes(input.endTime || "");
  const requestedRoom = roomsById.get(input.room || "");
  if (requestedStart === null || requestedEnd === null || !requestedRoom) return candidates[0];

  return candidates.find((candidate) => {
    const candidateStudents = candidate.streamStudentIds?.length
      ? candidate.streamStudentIds.map((id: unknown) => String(id))
      : legacyByCourse.get(String(candidate.course)) || [];
    const sharesStudent = candidateStudents.some((id: string) => requestedStudents.has(id));
    const legacyCohortConflict = !candidate.streamStudentIds?.length && candidateStudents.length === 0 && candidate.cohort === input.cohort;
    const sameRoom = String(candidate.room) === input.room;
    const sameLecturer = Boolean(input.lecturer && candidate.lecturer?.trim().toLowerCase() === input.lecturer.trim().toLowerCase());
    if (!sameRoom && !sameLecturer && !sharesStudent && !legacyCohortConflict) return false;
    const candidateStart = timeToMinutes(candidate.startTime);
    const candidateEnd = timeToMinutes(candidate.endTime);
    if (candidateStart === null || candidateEnd === null) return true;
    if (rangesOverlap(input.startTime || "", input.endTime || "", candidate.startTime, candidate.endTime)) return true;
    const gap = requestedStart >= candidateEnd ? requestedStart - candidateEnd : candidateStart - requestedEnd;
    const candidateRoom = roomsById.get(String(candidate.room));
    if (!candidateRoom) return true;
    const walkMinutes = sameRoom ? 0 : distanceMeters(requestedRoom, candidateRoom) / 70;
    return !Number.isFinite(walkMinutes) || walkMinutes + 10 > gap;
  });
}

function cohortFor(departmentCode: string, level: string) {
  return `${departmentCode} ${level}`.trim();
}

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    await connectToDatabase();
    const allocations = await TimetableAllocation.find({
      ...(params.get("academicYear") ? { academicYear: params.get("academicYear") } : {}),
      ...(params.get("semester") ? { semester: params.get("semester") } : {}),
      ...(params.get("department") ? { department: params.get("department") } : {}),
      ...(params.get("dayOfWeek") ? { dayOfWeek: params.get("dayOfWeek") } : {}),
      status: { $ne: "cancelled" },
    })
      .select("-streamStudentIds")
      .populate("department", "code name faculty")
      .populate("course", "code title level expectedEnrollment lecturer")
      .populate("room", "name code building capacity")
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();
    return NextResponse.json({ allocations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load timetable allocations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: TimetableMutationLock | null = null;
  try {
    const body = (await request.json()) as AllocationInput;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid allocation is required." }, { status: 400 });
    const required = [body.academicYear, body.semester, body.department, body.course, body.room, body.dayOfWeek, body.startTime, body.endTime];
    if (required.some((value) => typeof value !== "string" || !value.trim()) || !WEEKDAYS.includes(body.dayOfWeek as (typeof WEEKDAYS)[number]) || !isTimeRangeValid(body.startTime || "", body.endTime || "")) {
      return NextResponse.json({ error: "Academic year, semester, department, course, room, weekday, and a valid time range are required." }, { status: 400 });
    }
    if (body.status !== undefined && body.status !== "draft") {
      return NextResponse.json({ error: "Create allocations as drafts, then publish after all course sessions and student streams are complete." }, { status: 409 });
    }
    if (body.notes !== undefined && typeof body.notes !== "string") {
      return NextResponse.json({ error: "Allocation notes must be text." }, { status: 400 });
    }
    if (![body.department, body.course, body.room].every((id) => mongoose.isValidObjectId(id))) return NextResponse.json({ error: "Department, course, and room ids must be valid." }, { status: 400 });
    await connectToDatabase();
    lock = await acquireTimetableMutationLock(body.academicYear!, body.semester!);
    if (!lock) return NextResponse.json({ error: "Another timetable change is in progress for this academic year and semester." }, { status: 409 });
    const [department, course, room] = await Promise.all([
      Department.findById(body.department).lean(),
      Course.findById(body.course).lean(),
      Room.findById(body.room).lean(),
    ]);
    if (!department || !course || !room) return NextResponse.json({ error: "Department, course, or room was not found." }, { status: 404 });
    if (department.active === false || course.active === false) return NextResponse.json({ error: "Inactive departments or courses cannot receive new timetable allocations." }, { status: 409 });
    if (String(course.department) !== String(department._id)) return NextResponse.json({ error: "The selected course does not belong to this department." }, { status: 409 });
    if (course.semester !== body.semester!.trim()) return NextResponse.json({ error: "The selected course does not belong to this semester." }, { status: 409 });
    if (timeToMinutes(body.endTime!)! - timeToMinutes(body.startTime!)! !== (course.sessionMinutes || 120)) {
      return NextResponse.json({ error: `This course requires ${course.sessionMinutes || 120}-minute class sessions.` }, { status: 409 });
    }
    if (!["lecture_room", "laboratory", "seminar_room"].includes(room.spaceType || "lecture_room")) {
      return NextResponse.json({ error: "Only teaching spaces can receive timetable allocations. Select a lecture room, laboratory, or seminar room." }, { status: 409 });
    }
    if (!room.isAvailable) return NextResponse.json({ error: "This room is currently offline." }, { status: 409 });

    const students = await User.find({ role: "student", status: "active", enrolledCourses: course._id }).select("_id").lean();
    if (!students.length) return NextResponse.json({ error: "No active students are enrolled in this course. Add its roster before scheduling." }, { status: 409 });
    const studentIds = students.map((student) => String(student._id));
    if ((room.capacity || 0) < studentIds.length) return NextResponse.json({ error: `Room capacity (${room.capacity || 0}) is below the enrolled roster (${studentIds.length}). Use automatic streams for oversized courses.` }, { status: 409 });
    const preferredVenues = (course.preferredVenues || []).map(String);
    if (preferredVenues.length && !preferredVenues.includes(String(room._id))) return NextResponse.json({ error: "Select one of this course's preferred venues." }, { status: 409 });
    if (!preferredVenues.length && course.preferredSpaceTypes?.length && !course.preferredSpaceTypes.includes(room.spaceType || "lecture_room")) {
      return NextResponse.json({ error: "This venue does not match the course's teaching-space requirements." }, { status: 409 });
    }

    const cohort = cohortFor(department.code, course.level);
    const lecturer = course.lecturer?.trim() || "";
    const allocationInput = { ...body, lecturer, cohort };
    const conflict = await findConflict(allocationInput, studentIds);
    if (conflict) {
      const conflictRoom = String(conflict.room) === body.room ? room.name : "another scheduled venue";
      const conflictCourse = conflict.course && typeof conflict.course === "object" ? (conflict.course as { code?: string }).code : "another class";
      return NextResponse.json({ error: `Scheduling conflict: ${conflictCourse} already conflicts with ${conflictRoom}, the lecturer, or one or more enrolled students.` }, { status: 409 });
    }

    await renewTimetableMutationLock(lock);
    const allocation = await TimetableAllocation.create({
      academicYear: body.academicYear!.trim(),
      semester: body.semester!.trim(),
      department: department._id,
      course: course._id,
      room: room._id,
      cohort,
      lecturer,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      status: "draft",
      stream: "",
      streamSize: studentIds.length,
      streamCount: 1,
      streamStudentIds: students.map((student) => student._id),
      autoGenerated: false,
      notes: body.notes?.trim(),
    });
    const populated = await TimetableAllocation.findById(allocation._id).populate("department", "code name").populate("course", "code title").populate("room", "name code building capacity").lean();
    return NextResponse.json({ allocation: populated }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create timetable allocation." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableMutationLock(lock);
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: TimetableMutationLock | null = null;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || typeof body.id !== "string" || !mongoose.isValidObjectId(body.id) ||
      !["draft", "published", "cancelled"].includes(body.status) || Object.keys(body).some((key) => !["id", "status"].includes(key))) {
      return NextResponse.json({ error: "Only a valid allocation id and status may be changed." }, { status: 400 });
    }
    await connectToDatabase();
    const current = await TimetableAllocation.findById(body.id).lean();
    if (!current) return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
    lock = await acquireTimetableMutationLock(current.academicYear, current.semester);
    if (!lock) return NextResponse.json({ error: "Another timetable change is in progress for this academic year and semester." }, { status: 409 });
    const refreshed = await TimetableAllocation.findById(body.id).lean();
    if (!refreshed) return NextResponse.json({ error: "Allocation not found." }, { status: 404 });

    if (body.status === "published") {
      const room = await Room.findById(refreshed.room).lean();
      if (!room || !room.isAvailable) return NextResponse.json({ error: "The selected room is unavailable." }, { status: 409 });
      if (!["lecture_room", "laboratory", "seminar_room"].includes(room.spaceType || "lecture_room")) return NextResponse.json({ error: "The selected venue is not a teaching space." }, { status: 409 });
      if ((refreshed.streamStudentIds?.length || refreshed.streamSize || 0) > (room.capacity || 0)) return NextResponse.json({ error: "The selected room cannot accommodate the assigned students." }, { status: 409 });
      const [course, termAllocations] = await Promise.all([
        Course.findById(refreshed.course).lean(),
        TimetableAllocation.find({ academicYear: refreshed.academicYear, semester: refreshed.semester, status: { $ne: "cancelled" } }).lean(),
      ]);
      if (!course) return NextResponse.json({ error: "The course for this allocation no longer exists." }, { status: 409 });
      const termCourseIds = [...new Set(termAllocations.map((allocation) => String(allocation.course)))];
      const studentDocs = await User.find({ role: "student", status: "active", enrolledCourses: { $in: termCourseIds } })
        .select("_id enrolledCourses").lean();
      const studentsByCourse = new Map<string, string[]>();
      for (const student of studentDocs) {
        for (const enrolledCourse of student.enrolledCourses || []) {
          const key = String(enrolledCourse);
          const members = studentsByCourse.get(key);
          if (members) members.push(String(student._id));
          else studentsByCourse.set(key, [String(student._id)]);
        }
      }
      const roomIds = [...new Set(termAllocations.map((allocation) => String(allocation.room)))];
      const rooms = await Room.find({ _id: { $in: roomIds } }).lean();
      const publishAllocations = termAllocations.map((allocation) => ({
        id: String(allocation._id),
        courseId: String(allocation.course),
        roomId: String(allocation.room),
        cohort: allocation.cohort,
        lecturer: allocation.lecturer || "",
        dayOfWeek: allocation.dayOfWeek,
        startTime: allocation.startTime,
        endTime: allocation.endTime,
        stream: allocation.stream || "",
        streamSize: allocation.streamSize || 0,
        studentIds: allocation.streamStudentIds?.length
          ? allocation.streamStudentIds.map((id: unknown) => String(id))
          : studentsByCourse.get(String(allocation.course)) || [],
      }));
      const validationErrors = validateTimetableForPublishing(
        [{
          id: String(course._id),
          code: course.code,
          sessionsPerWeek: course.sessionsPerWeek || 2,
          sessionMinutes: course.sessionMinutes || 120,
          preferredVenues: (course.preferredVenues || []).map(String),
          preferredSpaceTypes: course.preferredSpaceTypes?.length ? course.preferredSpaceTypes : ["lecture_room", "laboratory", "seminar_room"],
        }],
        publishAllocations,
        rooms.map((item) => ({
          id: String(item._id),
          capacity: item.capacity || 0,
          latitude: item.latitude,
          longitude: item.longitude,
          available: item.isAvailable !== false,
          spaceType: item.spaceType || "lecture_room",
        })),
        new Map([[String(course._id), studentsByCourse.get(String(course._id)) || []]])
      );
      if (validationErrors.length) {
        return NextResponse.json({ error: "Publication is blocked until this course is complete and conflict-free.", details: validationErrors }, { status: 409 });
      }
      const conflict = await findConflict({
        id: body.id,
        academicYear: refreshed.academicYear,
        semester: refreshed.semester,
        room: String(refreshed.room),
        cohort: refreshed.cohort,
        lecturer: refreshed.lecturer,
        dayOfWeek: refreshed.dayOfWeek,
        startTime: refreshed.startTime,
        endTime: refreshed.endTime,
      }, studentsByCourse.get(String(course._id)) || []);
      if (conflict) return NextResponse.json({ error: "This allocation now conflicts with another class; resolve the conflict before publishing." }, { status: 409 });
    }

    await renewTimetableMutationLock(lock);
    await auditedMutation(access.session.user.id, `allocation.${body.status}`, body.id, {
      academicYear: refreshed.academicYear, semester: refreshed.semester, courseId: String(refreshed.course),
    }, async (session) => {
      if (body.status === "published") {
        await TimetableAllocation.updateMany(
          { course: refreshed.course, academicYear: refreshed.academicYear, semester: refreshed.semester, status: "draft" },
          { $set: { status: "published" } },
          { runValidators: true, session }
        );
      } else if (body.status === "draft") {
        await TimetableAllocation.updateMany(
          { course: refreshed.course, academicYear: refreshed.academicYear, semester: refreshed.semester, status: "published" },
          { $set: { status: "draft" } },
          { runValidators: true, session }
        );
      } else {
        await TimetableAllocation.findByIdAndUpdate(body.id, { $set: { status: body.status } }, { runValidators: true, session });
      }
    });
    const allocation = await TimetableAllocation.findById(body.id)
      .populate("department", "code name").populate("course", "code title").populate("room", "name code building capacity").lean();
    return NextResponse.json({ allocation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update allocation." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableMutationLock(lock);
  }
}
