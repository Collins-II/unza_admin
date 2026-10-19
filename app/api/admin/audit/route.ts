import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import AuditEvent from "@/lib/database/models/AuditEvent";

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) return access.response;
  try {
    const raw = new URL(request.url).searchParams.get("page") || "0";
    const page = Number(raw);
    if (!Number.isInteger(page) || page < 0 || page > 10000) return NextResponse.json({ error: "Invalid audit page." }, { status: 400 });
    await connectToDatabase();
    const events = await AuditEvent.find().sort({ createdAt: -1, _id: -1 }).skip(page * 50).limit(50).lean();
    return NextResponse.json({ events, page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Audit log retrieval failed:", error);
    return NextResponse.json({ error: "Unable to retrieve audit events." }, { status: 500 });
  }
}
