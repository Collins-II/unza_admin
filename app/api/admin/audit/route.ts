import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import AuditEvent from "@/lib/database/models/AuditEvent";
import { escapeSearch } from "@/lib/adminData";

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const raw = params.get("page") || "0";
    const action = params.get("action")?.trim() || "";
    if (action.length > 100) return NextResponse.json({ error: "Action search is limited to 100 characters." }, { status: 400 });
    const page = Number(raw);
    if (!Number.isInteger(page) || page < 0 || page > 10000) return NextResponse.json({ error: "Invalid audit page." }, { status: 400 });
    await connectToDatabase();
    const filter = action ? { action: { $regex: escapeSearch(action), $options: "i" } } : {};
    const [events, total] = await Promise.all([
      AuditEvent.find(filter).populate("actor", "name").sort({ createdAt: -1, _id: -1 }).skip(page * 50).limit(50).lean(),
      AuditEvent.countDocuments(filter),
    ]);
    return NextResponse.json({ events, page, total }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Audit log retrieval failed:", error);
    return NextResponse.json({ error: "Unable to retrieve audit events." }, { status: 500 });
  }
}
