import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const courses = await Course.find({ active: true }).populate("department", "code name faculty").sort({ code: 1 }).lean();
    return NextResponse.json({ courses });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load courses." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const department = typeof body.department === "string" ? body.department : "";
    const level = typeof body.level === "string" ? body.level.trim() : "";
    const semester = typeof body.semester === "string" ? body.semester.trim() : "";
    const expectedEnrollment = Number(body.expectedEnrollment);
    const credits = Number(body.credits);
    if (!code || !title || !department || !level || !semester || !Number.isInteger(expectedEnrollment) || expectedEnrollment < 1 || !Number.isInteger(credits) || credits < 1) {
      return NextResponse.json({ error: "Course code, title, department, level, semester, credits, and enrollment are required." }, { status: 400 });
    }
    await connectToDatabase();
    const course = await Course.create({ code, title, department, level, semester, expectedEnrollment, credits, lecturer: typeof body.lecturer === "string" ? body.lecturer.trim() : "" });
    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create course." }, { status: 500 });
  }
}
