import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Department from "@/lib/database/models/Department";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";
import { auditedMutation } from "@/lib/audit";

export async function GET() {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const departments = await Department.find(access.session.user.role === "admin" ? {} : { _id: { $in: access.session.user.departmentIds || [] } }).sort({ active: -1, faculty: 1, name: 1 }).lean();
    return NextResponse.json({ departments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load departments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const faculty = typeof body.faculty === "string" ? body.faculty.trim() : "";
    if (!code || !name || !faculty) return NextResponse.json({ error: "Department code, name, and faculty are required." }, { status: 400 });
    await connectToDatabase();
    const department = await Department.create({ code, name, faculty, headOfDepartment: typeof body.headOfDepartment === "string" ? body.headOfDepartment.trim() : "" });
    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) return NextResponse.json({ error: "A department with this code already exists." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create department." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : undefined;
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const faculty = typeof body.faculty === "string" ? body.faculty.trim() : undefined;
    const headOfDepartment = typeof body.headOfDepartment === "string" ? body.headOfDepartment.trim() : undefined;
    const active = typeof body.active === "boolean" ? body.active : undefined;
    if (!mongoose.isValidObjectId(id) || (!code && !name && !faculty && headOfDepartment === undefined && active === undefined)) {
      return NextResponse.json({ error: "A department id and at least one valid update are required." }, { status: 400 });
    }
    if ((code !== undefined && !code) || (name !== undefined && !name) || (faculty !== undefined && !faculty)) {
      return NextResponse.json({ error: "Department code, name, and faculty cannot be empty." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "A timetable change is in progress. Retry after it finishes." }, { status: 409 });
    if ((code !== undefined || active === false) && (
      await TimetableAllocation.exists({ department: id, status: { $ne: "cancelled" } }) ||
      await AssessmentAllocation.exists({ department: id, status: { $ne: "cancelled" } })
    )) {
      return NextResponse.json({ error: "Cancel this department's allocations before changing its code or deactivating it." }, { status: 409 });
    }
    await renewTimetableLock(lock);
    const department = await auditedMutation(access.session.user.id, "department.update", id, {
      ...(active !== undefined ? { active: String(active) } : {}), ...(code ? { code } : {}),
    }, async (session) => Department.findByIdAndUpdate(id, {
      ...(code !== undefined ? { code } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(faculty !== undefined ? { faculty } : {}),
      ...(headOfDepartment !== undefined ? { headOfDepartment } : {}),
      ...(active !== undefined ? { active } : {}),
    }, { new: true, runValidators: true, session }).lean());
    if (!department) return NextResponse.json({ error: "Department not found." }, { status: 404 });
    return NextResponse.json({ department });
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) return NextResponse.json({ error: "A department with this code already exists." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update department." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}

export async function DELETE(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "A valid department id is required." }, { status: 400 });
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "A timetable change is in progress. Retry after it finishes." }, { status: 409 });
    if (await TimetableAllocation.exists({ department: id, status: { $ne: "cancelled" } }) ||
        await AssessmentAllocation.exists({ department: id, status: { $ne: "cancelled" } })) {
      return NextResponse.json({ error: "Cancel this department's allocations before deactivating it." }, { status: 409 });
    }
    await renewTimetableLock(lock);
    const department = await auditedMutation(access.session.user.id, "department.deactivate", id, {}, async (session) =>
      Department.findByIdAndUpdate(id, { active: false }, { new: true, session }).lean());
    if (!department) return NextResponse.json({ error: "Department not found." }, { status: 404 });
    return NextResponse.json({ department });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to deactivate department." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
