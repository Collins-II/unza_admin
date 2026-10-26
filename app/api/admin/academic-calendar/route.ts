import { NextResponse } from "next/server";
import { requireAdminRole, requireSystemAdmin } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import AcademicTerm from "@/lib/database/models/AcademicTerm";
import { ACADEMIC_TERM_STATUSES } from "@/lib/academicCalendar";
import {
  AcademicCalendarError, createAcademicTerm, updateAcademicTerm,
} from "@/lib/academicCalendarService";

function failure(error: unknown) {
  if (error instanceof AcademicCalendarError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    return NextResponse.json({ error: "A calendar already exists for this year and semester. Reload and retry.", code: "DUPLICATE_TERM" }, { status: 409 });
  }
  console.error("Academic calendar request failed:", error);
  return NextResponse.json({ error: "Unable to access the academic calendar. Please retry." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const access = await requireAdminRole({ departmental: true });
    if (access.response) return access.response;
    const params = new URL(request.url).searchParams;
    const pageValue = params.get("page") ?? "1";
    const limitValue = params.get("limit") ?? "25";
    if (!/^[1-9]\d{0,5}$/.test(pageValue) || !/^[1-9]\d{0,2}$/.test(limitValue) || Number(limitValue) > 100) {
      return NextResponse.json({ error: "page must be a positive integer; limit must be between 1 and 100." }, { status: 400 });
    }
    const filter: Record<string, string> = {};
    for (const [field, max] of [["academicYear", 30], ["semester", 80]] as const) {
      const value = params.get(field);
      if (value === null) continue;
      if (!value.trim() || value.trim().length > max) {
        return NextResponse.json({ error: `${field} must be between 1 and ${max} characters.` }, { status: 400 });
      }
      filter[field] = value.trim();
    }
    const status = params.get("status");
    if (status !== null) {
      if (!ACADEMIC_TERM_STATUSES.includes(status as (typeof ACADEMIC_TERM_STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid calendar status." }, { status: 400 });
      }
      filter.status = status;
    }
    await connectToDatabase();
    const page = Number(pageValue);
    const limit = Number(limitValue);
    const [terms, total] = await Promise.all([
      AcademicTerm.find(filter).sort({ academicYear: -1, semester: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      AcademicTerm.countDocuments(filter),
    ]);
    return NextResponse.json({ terms, total, page, limit, pageCount: Math.ceil(total / limit) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const access = await requireSystemAdmin();
    if (access.response) return access.response;
    const body: unknown = await request.json().catch(() => null);
    const term = await createAcademicTerm(access.session.user.id, body);
    return NextResponse.json({ term }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireSystemAdmin();
    if (access.response) return access.response;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A valid academic term update is required." }, { status: 400 });
    }
    const { id, expectedVersion, ...patch } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "id and expectedVersion are required." }, { status: 400 });
    }
    const term = await updateAcademicTerm(access.session.user.id, id, expectedVersion, patch);
    return NextResponse.json({ term });
  } catch (error) { return failure(error); }
}
