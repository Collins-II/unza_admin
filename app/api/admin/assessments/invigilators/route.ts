import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import User from "@/lib/database/models/User";
import { escapeSearch } from "@/lib/adminData";

export async function GET(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim() || "";
    const pageValue = params.get("page") || "0";
    if (search.length > 100 || !/^\d{1,5}$/.test(pageValue)) {
      return NextResponse.json({ error: "Use a search of at most 100 characters and a valid page." }, { status: 400 });
    }
    const page = Number(pageValue);
    const filter = {
      role: { $in: ["admin", "staff"] }, status: "active",
      ...(search ? { name: { $regex: escapeSearch(search), $options: "i" } } : {}),
    };
    const [people, total] = await Promise.all([
      User.find(filter).select("_id name").sort({ name: 1, _id: 1 }).skip(page * 25).limit(25).maxTimeMS(15000).lean(),
      User.countDocuments(filter).maxTimeMS(15000),
    ]);
    return NextResponse.json({ people, total, page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Invigilator lookup failed:", error);
    return NextResponse.json({ error: "Unable to find active invigilators." }, { status: 500 });
  }
}
