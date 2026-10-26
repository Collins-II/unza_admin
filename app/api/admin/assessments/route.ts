import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAdminRole, departmentScope, departmentDenied } from "@/lib/adminAuth";
import { AcademicCalendarError } from "@/lib/academicCalendarService";
import { PublicationError } from "@/lib/publicationService";
import { connectToDatabase } from "@/lib/database";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import {
  AssessmentServiceError,
  createAssessmentAllocation,
  updateAssessmentAllocation,
  validateAssessmentFilters,
} from "@/lib/assessmentService";
import { ASSESSMENT_STATUSES, isRecord, isValidObjectIdString } from "@/lib/assessmentValidation";

export async function GET(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const academicYear = params.get("academicYear");
    const semester = params.get("semester");
    const department = params.get("department");
    const date = params.get("date");
    const filterError = validateAssessmentFilters({ academicYear, semester, department, date });
    if (filterError) return NextResponse.json({ error: filterError }, { status: 400 });
    if (department) {
      const denied = departmentDenied(access.session.user, department);
      if (denied) return denied;
    }

    const pageParam = params.get("page") ?? "1";
    const limitParam = params.get("limit") ?? "25";
    if (!/^[1-9]\d{0,5}$/.test(pageParam) || !/^[1-9]\d{0,2}$/.test(limitParam)) {
      return NextResponse.json({ error: "page and limit must be positive whole numbers." }, { status: 400 });
    }
    const page = Number(pageParam);
    const limit = Number(limitParam);
    if (limit > 100) return NextResponse.json({ error: "limit cannot exceed 100." }, { status: 400 });

    await connectToDatabase();
    const filter = {
      ...departmentScope(access.session.user),
      ...(academicYear !== null ? { academicYear: academicYear.trim() } : {}),
      ...(semester !== null ? { semester: semester.trim() } : {}),
      ...(department !== null ? { department } : {}),
      ...(date !== null ? { date } : {}),
    };
    const [records, total] = await Promise.all([
      AssessmentAllocation.find(filter)
        .populate("department", "code name faculty")
        .populate("course", "code title semester")
        .populate("room", "name code building capacity")
        .populate("invigilatorIds", "name email role")
        .sort({ date: 1, startTime: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AssessmentAllocation.countDocuments(filter),
    ]);
    const allocations = records.map((record) => {
      const { invigilatorIds, studentIds, ...safeRecord } = record;
      const populatedInvigilators = (invigilatorIds || []) as unknown[];
      return {
        ...safeRecord,
        studentCount: studentIds?.length ?? 0,
        invigilatorIds: populatedInvigilators.map((person: unknown) =>
          person && typeof person === "object" && "_id" in person ? String(person._id) : String(person)
        ),
        invigilators: populatedInvigilators.map((person: unknown) => {
          if (!person || typeof person !== "object" || !("_id" in person)) return null;
          const staff = person as { _id: mongoose.Types.ObjectId; name?: string; email?: string; role?: string };
          return { id: String(staff._id), name: staff.name, email: staff.email, role: staff.role };
        }).filter(Boolean),
      };
    });
    return NextResponse.json({ allocations, page, limit, total, pageCount: Math.ceil(total / limit) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Assessment allocations retrieval failed:", error);
    return NextResponse.json({ error: "Unable to load assessment allocations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "A valid assessment object is required." }, { status: 400 });
    const allocation = await createAssessmentAllocation(access.session.user.id, body);
    const { studentIds, ...safeAllocation } = allocation as Record<string, unknown>;
    return NextResponse.json({
      allocation: { ...safeAllocation, studentCount: Array.isArray(studentIds) ? studentIds.length : 0 },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AssessmentServiceError || error instanceof AcademicCalendarError || error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Assessment allocation creation failed:", error);
    return NextResponse.json({ error: "Unable to create assessment allocation." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const body: unknown = await request.json().catch(() => null);
    const allowed = new Set([
      "id", "expectedVersion", "status", "approvalId", "academicYear", "semester", "department", "course",
      "date", "startTime", "endTime", "room", "title", "assessmentType", "studentIds", "invigilatorIds",
    ]);
    if (!isRecord(body) || Object.keys(body).some((key) => !allowed.has(key)) ||
        !isValidObjectIdString(body.id) ||
        !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0 ||
        !ASSESSMENT_STATUSES.includes(body.status as (typeof ASSESSMENT_STATUSES)[number])) {
      return NextResponse.json({ error: "A valid id, expectedVersion, and draft/published/cancelled status are required." }, { status: 400 });
    }
    const { id, expectedVersion, status, approvalId, ...patch } = body;
    if (approvalId !== undefined && typeof approvalId !== "string") return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
    const allocation = await updateAssessmentAllocation(
      access.session.user.id,
      id,
      expectedVersion as number,
      patch,
      status as (typeof ASSESSMENT_STATUSES)[number],
      approvalId,
    );
    const { studentIds, ...safeAllocation } = allocation as Record<string, unknown>;
    return NextResponse.json({
      allocation: { ...safeAllocation, studentCount: Array.isArray(studentIds) ? studentIds.length : 0 },
    });
  } catch (error) {
    if (error instanceof AssessmentServiceError || error instanceof AcademicCalendarError || error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Assessment allocation update failed:", error);
    return NextResponse.json({ error: "Unable to update assessment allocation." }, { status: 500 });
  }
}
