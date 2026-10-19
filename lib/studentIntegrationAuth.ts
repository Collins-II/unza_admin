import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function requireStudentIntegrationKey(request: Request) {
  const expected = Buffer.from(process.env.STUDENT_APP_API_KEY || "");
  const received = Buffer.from(request.headers.get("x-student-app-key") || "");
  const matches = expected.length > 0 && received.length === expected.length && timingSafeEqual(received, expected);
  return matches ? null : NextResponse.json({ error: "Student app integration credentials are required." }, { status: 401 });
}
