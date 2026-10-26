import { NextResponse } from "next/server";
import { requireAdminRole, requireSystemAdmin } from "@/lib/adminAuth";
import User from "@/lib/database/models/User";
import Department from "@/lib/database/models/Department";
import { validateDepartmentAssignments } from "@/lib/departmentAccess";
import { auditedMutation } from "@/lib/audit";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";

export async function GET() {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  return NextResponse.json({ role: access.session.user.role, departmentIds: access.session.user.departmentIds }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  let access = await requireSystemAdmin();
  if (access.response) return access.response;
  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !["id", "departmentIds", "expectedVersion"].includes(key)) ||
        !("id" in body) || typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id) ||
        !("departmentIds" in body) || !validateDepartmentAssignments(body.departmentIds) ||
        !("expectedVersion" in body) || typeof body.expectedVersion !== "number" || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) {
      return NextResponse.json({ error: "A staff id, current version and distinct department IDs are required." }, { status: 400 });
    }
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Academic configuration is busy. Retry shortly." }, { status: 409 });
    access = await requireSystemAdmin();
    if (access.response) return access.response;
    const current = await User.findOne({ _id: body.id, role: "staff" }).select("_id __v departmentIds").lean();
    if (!current) return NextResponse.json({ error: "Staff account not found. Administrators already have university-wide access." }, { status: 404 });
    if ((current.__v || 0) !== body.expectedVersion) return NextResponse.json({ error: "Staff access changed. Reload before saving." }, { status: 409 });
    if (await Department.countDocuments({ _id: { $in: body.departmentIds }, active: true }) !== body.departmentIds.length) {
      return NextResponse.json({ error: "Assign existing active departments only." }, { status: 400 });
    }
    await renewTimetableLock(lock);
    const saved = await auditedMutation(access.session.user.id, "access.departments", body.id, {
      before: (current.departmentIds || []).map(String).join(","), after: body.departmentIds.join(","),
    }, (session) => User.findOneAndUpdate({ _id: body.id, __v: current.__v }, {
      $set: { departmentIds: body.departmentIds }, $inc: { __v: 1 },
    }, { new: true, session }).select("_id __v departmentIds").lean());
    if (!saved) return NextResponse.json({ error: "Access changed during save. Reload and retry." }, { status: 409 });
    return NextResponse.json({ account: saved });
  } catch (error) {
    console.error("Department access update failed:", error);
    return NextResponse.json({ error: "Unable to update department access." }, { status: 500 });
  } finally { if (lock) await releaseTimetableLock(lock); }
}
