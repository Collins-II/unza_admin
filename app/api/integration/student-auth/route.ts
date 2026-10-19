import { NextResponse } from "next/server";

import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";
import { verifyStudentCredentials } from "@/lib/studentAuth";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    const result = await verifyStudentCredentials(body?.studentId, body?.password);
    if (!result.ok) {
      return result.reason === "locked"
        ? NextResponse.json({ error: "Too many failed attempts. Try again later or ask the registrar to reset your password." }, { status: 429, headers: NO_STORE })
        : NextResponse.json({ error: "Invalid student ID or password." }, { status: 401, headers: NO_STORE });
    }
    return NextResponse.json({ student: result.student }, { headers: NO_STORE });
  } catch (error) {
    console.error("Student sign-in failed:", error);
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500, headers: NO_STORE });
  }
}
