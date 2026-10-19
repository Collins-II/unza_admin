import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";
import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";
import { verifyStudentCredentials } from "@/lib/studentAuth";
import { MIN_STUDENT_PASSWORD_LENGTH } from "@/lib/studentRegistration";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < MIN_STUDENT_PASSWORD_LENGTH || newPassword.length > 200) {
      return NextResponse.json({ error: `New password must be at least ${MIN_STUDENT_PASSWORD_LENGTH} characters long.` }, { status: 400, headers: NO_STORE });
    }
    if (newPassword === body?.currentPassword) {
      return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400, headers: NO_STORE });
    }
    const result = await verifyStudentCredentials(body?.studentId, body?.currentPassword);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason === "locked" ? "Too many failed attempts. Try again later." : "Invalid student ID or password." }, { status: result.reason === "locked" ? 429 : 401, headers: NO_STORE });
    }
    await connectToDatabase();
    await User.updateOne({ _id: result.student.id }, {
      password: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("Student password change failed:", error);
    return NextResponse.json({ error: "Unable to change the password right now." }, { status: 500, headers: NO_STORE });
  }
}
