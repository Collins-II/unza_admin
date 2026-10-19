import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Counter from "@/lib/database/models/Counter";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { formatStudentId, generateTemporaryPassword, MAX_BULK_STUDENTS, normalizeStudentInput, parseStudentCsv, type StudentInput } from "@/lib/studentRegistration";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";
import { auditedMutation } from "@/lib/audit";

const NO_STORE = { "Cache-Control": "private, no-store" };
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isDuplicate = (error: unknown): error is { code: number; keyPattern?: Record<string, unknown> } =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

async function nextStudentId() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate({ key: `student-${year}` }, { $inc: { value: 1 } }, { upsert: true, new: true });
  return formatStudentId(year, counter.value);
}

async function registerStudent(input: StudentInput, registeredBy: string) {
  const temporaryPassword = generateTemporaryPassword();
  const password = await bcrypt.hash(temporaryPassword, 10);
  const generated = !input.studentId;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const studentId = input.studentId || await nextStudentId();
    try {
      const student = await User.create({
        studentId,
        name: input.name,
        email: input.email,
        password,
        role: "student",
        status: "active",
        program: input.program,
        year: input.year,
        department: input.department,
        phone: input.phone,
        mustChangePassword: true,
        registeredBy,
      });
      return { id: String(student._id), studentId: student.studentId as string, name: input.name, email: input.email, temporaryPassword };
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      if (error.keyPattern?.email) throw new Error(`A user with email ${input.email} already exists.`);
      if (!generated) throw new Error(`Student ID ${studentId} is already assigned.`);
    }
  }
  throw new Error("Unable to allocate a unique student ID. Retry.");
}

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim() || "";
    const courseId = params.get("courseId") || "";
    const statusParam = params.get("status") || "";
    const page = Math.max(0, Math.min(1000, Number(params.get("page")) || 0));
    const limit = Math.max(1, Math.min(100, Number(params.get("limit")) || 50));
    if (courseId && !mongoose.isValidObjectId(courseId)) return NextResponse.json({ error: "Invalid course id." }, { status: 400 });
    if (search.length === 1) return NextResponse.json({ error: "Search must contain at least two characters." }, { status: 400 });
    if (statusParam && !["active", "inactive", "all"].includes(statusParam)) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });

    await connectToDatabase();
    const pattern = search ? new RegExp(escapeRegExp(search), "i") : null;
    const filter = {
      role: "student",
      status: statusParam === "all" ? { $in: ["active", "inactive", "pending"] } : statusParam || "active",
      ...(courseId ? { enrolledCourses: courseId } : {}),
      ...(pattern ? { $or: [{ name: pattern }, { studentId: pattern }, { email: pattern }] } : {}),
    };
    const [students, total] = await Promise.all([
      User.find(filter).select("name studentId email program year department status mustChangePassword createdAt enrolledCourses").sort({ studentId: 1 }).skip(page * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return NextResponse.json({
      students: students.map((student) => ({
        id: String(student._id),
        name: student.name,
        studentId: student.studentId,
        email: student.email,
        program: student.program,
        year: student.year,
        department: student.department,
        status: student.status,
        mustChangePassword: Boolean(student.mustChangePassword),
        enrolledCourses: (student.enrolledCourses || []).map(String),
      })),
      total,
      page,
      pageSize: limit,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load students." }, { status: 500 });
  }
}

/** Registers one student or a batch (`students: []`). Temporary passwords are returned once and never stored in plain text. */
export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = await request.json();
    const csv = typeof body?.csv === "string" ? parseStudentCsv(body.csv) : null;
    if (csv?.error) return NextResponse.json({ error: csv.error }, { status: 400 });
    const isBatch = Boolean(csv) || Array.isArray(body?.students);
    const rawRecords: unknown[] = csv ? csv.records : Array.isArray(body?.students) ? body.students : [body];
    if (!rawRecords.length || rawRecords.length > MAX_BULK_STUDENTS) {
      return NextResponse.json({ error: `Register between 1 and ${MAX_BULK_STUDENTS} students per request.` }, { status: 400 });
    }
    const normalized = rawRecords.map((raw) => normalizeStudentInput(raw));
    const firstError = normalized[0];
    if (!isBatch && "error" in firstError) return NextResponse.json({ error: firstError.error }, { status: 400 });

    await connectToDatabase();
    const created: Awaited<ReturnType<typeof registerStudent>>[] = [];
    const failed: { row: number; error: string }[] = [];
    const seen = new Set<string>();
    for (const [index, result] of normalized.entries()) {
      if ("error" in result) { failed.push({ row: index + 1, error: result.error }); continue; }
      const key = result.value.email;
      if (seen.has(key)) { failed.push({ row: index + 1, error: `Duplicate email ${key} in this batch.` }); continue; }
      seen.add(key);
      try {
        created.push(await registerStudent(result.value, access.session.user.id));
      } catch (error) {
        failed.push({ row: index + 1, error: error instanceof Error ? error.message : "Unable to register student." });
      }
    }
    return NextResponse.json({ created, failed }, { status: created.length ? 201 : 400, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to register students." }, { status: 500 });
  }
}

/** Updates profile details, suspends/reactivates an account, or issues a new temporary password. */
export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "A valid student id is required." }, { status: 400 });
    const action = body.action;
    if (!["update", "set-status", "reset-password"].includes(action)) return NextResponse.json({ error: "Unsupported student action." }, { status: 400 });

    await connectToDatabase();
    const student = await User.findOne({ _id: id, role: "student" }).select("name studentId email status");
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    if (action === "reset-password") {
      if (student.status !== "active") return NextResponse.json({ error: "Reactivate the student before resetting their password." }, { status: 409 });
      const temporaryPassword = generateTemporaryPassword();
      const password = await bcrypt.hash(temporaryPassword, 10);
      await auditedMutation(access.session.user.id, "student.password-reset", id, {}, async (session) => User.updateOne({ _id: id }, {
        password,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        $unset: { lockedUntil: 1 },
      }, { session }));
      return NextResponse.json({ studentId: student.studentId, name: student.name, temporaryPassword }, { headers: NO_STORE });
    }

    if (action === "set-status") {
      const status = body.status;
      if (!["active", "inactive"].includes(status)) return NextResponse.json({ error: "Status must be active or inactive." }, { status: 400 });
      if (status === "inactive") {
        lock = await acquireTimetableConfigurationLock();
        if (!lock) return NextResponse.json({ error: "A timetable update is in progress. Retry after it finishes." }, { status: 409 });
        if (await TimetableAllocation.exists({ streamStudentIds: student._id, status: "published" })) {
          return NextResponse.json({ error: "This student is part of a published timetable. Unenrol them from their courses and republish before deactivating the account." }, { status: 409 });
        }
        await renewTimetableLock(lock);
      }
      await auditedMutation(access.session.user.id, "student.status", id, { status }, async (session) => User.updateOne({ _id: id }, { status }, { session }));
      return NextResponse.json({ ok: true, status });
    }

    const parsed = normalizeStudentInput({ ...body, name: body.name ?? student.name, email: body.email ?? student.email });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { name, email, program, year, department, phone } = parsed.value;
    await User.updateOne({ _id: id }, { name, email, program, year, department, phone });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isDuplicate(error)) return NextResponse.json({ error: "That email address is already in use." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update student." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
