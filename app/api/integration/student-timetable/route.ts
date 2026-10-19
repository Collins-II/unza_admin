import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";

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
      .select("-streamStudentIds")
      .populate("department", "code name")
      .populate("course", "code title level expectedEnrollment")
      .populate("room", "name code building capacity latitude longitude")
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();
    return NextResponse.json({ studentId, timetable }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the student timetable." }, { status: 500 });
  }
}
