import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";
import AcademicTerm from "@/lib/database/models/AcademicTerm";

export async function GET(request: Request) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    const studentId = params.get("studentId")?.trim().toUpperCase();
    if (!studentId) return NextResponse.json({ error: "Student ID is required." }, { status: 400 });
    await connectToDatabase();
    const student = await User.findOne({ studentId, role: "student", status: "active" }).select("_id").lean();
    if (!student) return NextResponse.json({ error: "Active student account was not found." }, { status: 404 });
    const timetable = await TimetableAllocation.find({
      status: "published",
      streamStudentIds: student._id,
      ...(params.get("academicYear") ? { academicYear: params.get("academicYear") } : {}),
      ...(params.get("semester") ? { semester: params.get("semester") } : {}),
    })
      .select("-streamStudentIds -createdBy")
      .populate("department", "code name")
      .populate("course", "code title level expectedEnrollment")
      .populate("room", "name code building capacity latitude longitude")
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();
    const assessments = await AssessmentAllocation.find({
      status: "published", studentIds: student._id,
      ...(params.get("academicYear") ? { academicYear: params.get("academicYear") } : {}),
      ...(params.get("semester") ? { semester: params.get("semester") } : {}),
    }).select("academicYear semester department course room date startTime endTime title assessmentType status")
      .populate("department", "code name").populate("course", "code title")
      .populate("room", "name code building latitude longitude").sort({ date: 1, startTime: 1, _id: 1 }).lean();
    const academicTerms = await AcademicTerm.find({
      status: "approved",
      ...(params.get("academicYear") ? { academicYear: params.get("academicYear") } : {}),
      ...(params.get("semester") ? { semester: params.get("semester") } : {}),
    }).select("academicYear semester status teachingStartDate teachingEndDate assessmentStartDate assessmentEndDate").sort({ teachingStartDate: 1 }).lean();
    return NextResponse.json({ studentId, timetable, assessments, academicTerms, timeZone: "Africa/Lusaka" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the student timetable." }, { status: 500 });
  }
}
