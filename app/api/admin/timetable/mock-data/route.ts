import { readFile } from "node:fs/promises";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireSystemAdmin } from "@/lib/adminAuth";
import { recordAudit } from "@/lib/audit";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { buildMockTimetable } from "@/lib/mockTimetable";
import { generateTemporaryPassword, parseStudentCsv } from "@/lib/studentRegistration";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Demo setup is available only in development." }, { status: 403 });
  const access = await requireSystemAdmin();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  let stage = "fixtures";
  try {
    const body = await request.json();
    if (typeof body?.semester !== "string" || !body.semester.trim() || body.semester.trim().length > 80) {
      return NextResponse.json({ error: "A semester of at most 80 characters is required." }, { status: 400 });
    }
    const semester = body.semester.trim();
    const batches = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const csv = await readFile(join(process.cwd(), "fixtures", "students", `students-${String(index + 1).padStart(2, "0")}.csv`), "utf8");
      const parsed = parseStudentCsv(csv);
      if (parsed.error) throw new Error(parsed.error);
      return parsed.records;
    }));
    const catalogue: unknown = JSON.parse(await readFile(join(process.cwd(), "fixtures", "unza", "catalogue.json"), "utf8"));
    const plan = buildMockTimetable(batches.flat(), catalogue);
    await connectToDatabase();
    stage = "required indexes";
    await Promise.all([User.createIndexes(), Department.createIndexes(), Course.createIndexes(), Room.createIndexes(), TimetableAllocation.createIndexes()]);
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Another timetable change is in progress. Retry after it finishes." }, { status: 409 });
    const heldLock = lock;
    const legacy = await User.exists({
      studentId: { $in: plan.students.map((student) => student.studentId) },
      email: { $not: /^mock\.unza-/ },
    });
    if (legacy) return NextResponse.json({ error: "The existing four-department mock dataset is preserved. Version 2 reuses its student IDs with different profiles. Use a separate test database or an explicitly approved migration; existing accounts and schedules will not be overwritten." }, { status: 409 });
    // Random, undisclosed hashes keep demo accounts unusable until staff reset their passwords.
    const password = await bcrypt.hash(generateTemporaryPassword(32), 10);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await renewTimetableLock(heldLock);
        const departmentIds = new Map<string, mongoose.Types.ObjectId>();
        for (const department of plan.departments) {
          stage = `department ${department.code}`;
          const saved = await Department.findOneAndUpdate(
            { code: department.code, name: department.name, faculty: department.faculty },
            { $setOnInsert: { ...department, verifiedAt: plan.verifiedAt, active: true } },
            { upsert: true, new: true, session }
          );
          if (!saved.active) throw new Error(`Reactivate ${department.code} before running demo setup.`);
          departmentIds.set(department.code, saved._id);
        }
        const roomIds: mongoose.Types.ObjectId[] = [];
        for (const room of plan.rooms) {
          stage = `room ${room.code}`;
          const saved = await Room.findOneAndUpdate(
            { code: room.code, description: "Timetable demo fixture" },
            { $setOnInsert: { ...room, description: "Timetable demo fixture", building: "Mock teaching block", spaceType: "lecture_room", category: "demo", isAvailable: true, location: { type: "Point", coordinates: [room.longitude, room.latitude] } } },
            { upsert: true, new: true, session }
          );
          roomIds.push(saved._id);
        }
        const courseIds = new Map<string, mongoose.Types.ObjectId>();
        for (const course of plan.courses) {
          stage = `course ${course.code}`;
          const department = departmentIds.get(course.departmentCode);
          const saved = await Course.findOneAndUpdate(
            { code: course.code, title: course.title, department, semester },
            { $setOnInsert: { code: course.code, title: course.title, department, semester, level: course.level, credits: 3, expectedEnrollment: course.students.length, lecturer: `Demo lecturer ${course.code}`, sessionsPerWeek: 2, sessionMinutes: 60, preferredVenues: roomIds, preferredSpaceTypes: ["lecture_room"], active: true } },
            { upsert: true, new: true, session }
          );
          if (!saved.active) throw new Error(`Reactivate ${course.code} before running demo setup.`);
          courseIds.set(course.code, saved._id);
        }
        const enrolments = new Map<string, mongoose.Types.ObjectId[]>();
        for (const course of plan.courses) {
          const courseId = courseIds.get(course.code);
          if (!courseId) throw new Error(`Missing demo course ${course.code}.`);
          for (const student of course.students) {
            const ids = enrolments.get(student.studentId) || [];
            ids.push(courseId);
            enrolments.set(student.studentId, ids);
          }
        }
        const existing = await User.find({
          $or: [{ studentId: { $in: plan.students.map((student) => student.studentId) } }, { email: { $in: plan.students.map((student) => student.email) } }],
        }).select("studentId email name role status program year department enrolledCourses").session(session).lean();
        const byId = new Map(existing.map((student) => [student.studentId, student]));
        const needsEnrolment = plan.students.some((student) => {
          const saved = byId.get(student.studentId);
          const expected = enrolments.get(student.studentId) || [];
          return !saved || expected.some((id) => !(saved.enrolledCourses || []).some((enrolled: mongoose.Types.ObjectId) => String(enrolled) === String(id)));
        });
        if (needsEnrolment && await TimetableAllocation.exists({ course: { $in: [...courseIds.values()] }, status: { $ne: "cancelled" } }).session(session)) {
          throw new Error("Cancel existing demo allocations before changing demo enrolments, then generate a fresh schedule.");
        }
        for (const student of plan.students) {
          const saved = byId.get(student.studentId);
          if (saved && (saved.role !== "student" || saved.status !== "active" || saved.email !== student.email || saved.name !== student.name ||
              saved.program !== student.program || saved.year !== student.year || saved.department !== student.department)) {
            throw new Error(`Demo student ${student.studentId} conflicts with an existing or inactive account. No changes were committed.`);
          }
        }
        stage = "student enrolments";
        await User.bulkWrite(plan.students.map((student) => ({
          updateOne: {
            filter: { studentId: student.studentId, email: student.email, role: "student", name: student.name, status: "active" },
            update: {
              $setOnInsert: { ...student, role: "student", status: "active", password, mustChangePassword: true, registeredBy: access.session.user.id },
              $addToSet: { enrolledCourses: { $each: enrolments.get(student.studentId) || [] } },
            },
            upsert: true,
          },
        })), { session });
        await recordAudit(session, access.session.user.id, "timetable.mock-data.connect", plan.version, {
          semester, students: String(plan.students.length), courses: String(plan.courses.length),
          departments: String(plan.departments.length),
        });
        await renewTimetableLock(heldLock);
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ version: plan.version, students: plan.students.length, courses: plan.courses.length, departments: plan.departments.length, rooms: plan.rooms.length, enrolments: plan.courses.reduce((count, course) => count + course.students.length, 0), semester }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const duplicate = error instanceof Error && "code" in error && error.code === 11000;
    const fields = duplicate && "keyPattern" in error && error.keyPattern && typeof error.keyPattern === "object"
      ? Object.keys(error.keyPattern).join(", ") : "unknown field";
    return NextResponse.json({ error: duplicate ? `Demo setup at ${stage} conflicts with an existing unique index (${fields}). No changes were committed.` : error instanceof Error ? error.message : "Unable to set up demo timetable data." }, { status: duplicate ? 409 : 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
