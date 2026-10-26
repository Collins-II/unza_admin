import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";
import Department from "@/lib/database/models/Department";
import { isActiveStaff } from "@/lib/accountPolicy";
import { canAccessDepartment } from "@/lib/departmentAccess";

export type AdminRole = "staff" | "admin";

export async function requireAdminRole(options: { departmental?: boolean } = {}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      session: null,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  await connectToDatabase();
  const current = await User.findById(session.user.id).select("role status departmentIds").lean();
  if (!current || !isActiveStaff(current)) {
    return {
      session: null,
      response: NextResponse.json({ error: "University staff access is required." }, { status: 403 }),
    };
  }
  session.user.role = current.role;
  session.user.departmentIds = (current.departmentIds || []).map(String);
  if (current.role === "staff" && (!options.departmental || !session.user.departmentIds.length)) {
    return { session: null, response: NextResponse.json({
      error: !session.user.departmentIds.length
        ? "No departments are assigned to your account. Ask an administrator to configure department access."
        : "This central operation requires administrator access.",
    }, { status: 403 }) };
  }

  return { session, response: null };
}

export function departmentDenied(user: { role: string; departmentIds?: string[] }, id: string) {
  return canAccessDepartment(user, id) ? null : NextResponse.json({ error: "This department is outside your assigned access." }, { status: 403 });
}

export function departmentScope(user: { role: string; departmentIds?: string[] }) {
  return user.role === "admin" ? {} : { department: { $in: user.departmentIds || [] } };
}

export async function studentDepartmentScope(user: { role: string; departmentIds?: string[] }) {
  if (user.role === "admin") return {};
  const departments = await Department.find({ _id: { $in: user.departmentIds || [] }, active: true }).select("code").lean();
  return { department: { $in: departments.map((department) => department.code) } };
}

export async function requireSystemAdmin() {
  const access = await requireAdminRole();
  if (access.response) return access;

  if (access.session?.user.role !== "admin") {
    return {
      session: null,
      response: NextResponse.json({ error: "Administrator access is required." }, { status: 403 }),
    };
  }

  return access;
}

export function isAdminRole(role: string | undefined): role is AdminRole {
  return role === "staff" || role === "admin";
}
