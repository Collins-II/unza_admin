import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";
import { isActiveStaff } from "@/lib/accountPolicy";

export type AdminRole = "staff" | "admin";

export async function requireAdminRole() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      session: null,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  await connectToDatabase();
  const current = await User.findById(session.user.id).select("role status").lean();
  if (!current || !isActiveStaff(current)) {
    return {
      session: null,
      response: NextResponse.json({ error: "University staff access is required." }, { status: 403 }),
    };
  }
  session.user.role = current.role;

  return { session, response: null };
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
