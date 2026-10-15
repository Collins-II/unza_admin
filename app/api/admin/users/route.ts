import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { requireAdminRole, requireSystemAdmin } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;

  try {
    const query = new URL(request.url).searchParams.get("q")?.trim();
    await connectToDatabase();
    const escapedQuery = query?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = escapedQuery
      ? { $or: [{ name: new RegExp(escapedQuery, "i") }, { studentId: new RegExp(escapedQuery, "i") }, { email: new RegExp(escapedQuery, "i") }] }
      : {};
    const users = await User.find({ ...filter, role: { $in: ["staff", "admin"] } }).select("name studentId email role department status createdAt").sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) return access.response;

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const staffId = typeof body.staffId === "string" ? body.staffId.trim().toUpperCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const department = typeof body.department === "string" ? body.department.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : "staff";

    if (!name || !staffId || !email || !password) return NextResponse.json({ error: "Name, staff ID, email, and password are required." }, { status: 400 });
    if (!/^[A-Z0-9-]{4,32}$/.test(staffId)) return NextResponse.json({ error: "Staff ID must contain 4-32 uppercase letters, numbers, or hyphens." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid university email address is required." }, { status: 400 });
    if (password.length < 12) return NextResponse.json({ error: "Password must be at least 12 characters long." }, { status: 400 });

    await connectToDatabase();
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, studentId: staffId, email, password: passwordHash, role, department, status: "active" });
    return NextResponse.json({ user: { id: String(user._id), name: user.name, staffId: user.studentId, email: user.email, department: user.department, role: user.role, status: user.status } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) return NextResponse.json({ error: "A matching staff ID or email address already exists." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create staff account." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) return access.response;

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const status = ["active", "pending", "inactive"].includes(body.status) ? body.status : undefined;
    const role = ["staff", "admin"].includes(body.role) ? body.role : undefined;
    if (!id || (!status && !role)) return NextResponse.json({ error: "A user id and valid update are required." }, { status: 400 });

    await connectToDatabase();
    const user = await User.findByIdAndUpdate(id, { ...(status ? { status } : {}), ...(role ? { role } : {}) }, { new: true })
      .select("name studentId email role department program year status");
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update user." }, { status: 500 });
  }
}
