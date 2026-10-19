import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { acquireTimetableMutationLock, releaseTimetableMutationLock, renewTimetableMutationLock, type TimetableMutationLock } from "@/lib/timetableLock";
import { auditedMutation } from "@/lib/audit";

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const courseId = params.get("courseId") || "";
    if (!mongoose.isValidObjectId(courseId)) return NextResponse.json({ error: "A valid course id is required." }, { status: 400 });
    await connectToDatabase();
    const [course, count] = await Promise.all([
      Course.findById(courseId).select("code title expectedEnrollment").lean(),
      User.countDocuments({ role: "student", status: "active", enrolledCourses: courseId }),
    ]);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    return NextResponse.json({ count, expectedEnrollment: course.expectedEnrollment });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load course enrolments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: TimetableMutationLock | null = null;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "A valid enrolment request is required." }, { status: 400 });
    if (Array.isArray(body.studentIds) && body.studentIds.some((id: unknown) => typeof id !== "string")) return NextResponse.json({ error: "Student ids must be strings." }, { status: 400 });
    const studentIds = Array.isArray(body.studentIds) ? [...new Set<string>(body.studentIds)] : typeof body.studentId === "string" ? [body.studentId] : [];
    if (!mongoose.isValidObjectId(body.courseId) || typeof body.academicYear !== "string" || !body.academicYear.trim() ||
      typeof body.semester !== "string" || !body.semester.trim() ||
      !studentIds.length || studentIds.length > 2000 || studentIds.some((id) => !mongoose.isValidObjectId(id)) || typeof body.enrolled !== "boolean") {
      return NextResponse.json({ error: "Course id, up to 2000 valid student ids, and enrolment status are required." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableMutationLock(body.academicYear.trim(), body.semester.trim());
    if (!lock) return NextResponse.json({ error: "A timetable change is in progress for this academic year and semester. Retry after it finishes." }, { status: 409 });
    const [course, student] = await Promise.all([
      Course.findById(body.courseId).select("_id active").lean(),
      User.find({ _id: { $in: studentIds }, role: "student", status: "active" }).select("_id").lean(),
    ]);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.active === false) return NextResponse.json({ error: "Inactive courses cannot be assigned student enrolments." }, { status: 409 });
    if (student.length !== studentIds.length) return NextResponse.json({ error: "One or more active student accounts were not found." }, { status: 404 });

    const published = await TimetableAllocation.exists({
      course: body.courseId,
      status: "published",
    });
    if (published) return NextResponse.json({ error: "Unpublish or cancel this course's schedules in every academic year and semester before changing its global enrolment." }, { status: 409 });

    await renewTimetableMutationLock(lock);
    const update = await auditedMutation(access.session.user.id, body.enrolled ? "roster.enrol" : "roster.unenrol", String(course._id), { studentCount: String(studentIds.length) }, async (session) => User.updateMany(
      { _id: { $in: studentIds } },
      body.enrolled ? { $addToSet: { enrolledCourses: course._id } } : { $pull: { enrolledCourses: course._id } },
      { session }
    ));
    const count = await User.countDocuments({ role: "student", status: "active", enrolledCourses: course._id });
    return NextResponse.json({ count, changed: update.modifiedCount, enrolled: body.enrolled });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update course enrolment." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableMutationLock(lock);
  }
}
