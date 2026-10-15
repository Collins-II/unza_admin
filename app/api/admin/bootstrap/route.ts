import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";

const staffIdPattern = /^[A-Z0-9-]{4,32}$/;

export async function GET() {
  try {
    await connectToDatabase();
    const accountCount = await User.countDocuments({ role: { $in: ["staff", "admin"] } });
    return NextResponse.json({ setupRequired: accountCount === 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check system setup." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const staffId = typeof body.staffId === "string" ? body.staffId.trim().toUpperCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const department = typeof body.department === "string" ? body.department.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const setupToken = typeof body.setupToken === "string" ? body.setupToken : "";
    const configuredSetupToken = process.env.INITIAL_ADMIN_SETUP_TOKEN;

    if (process.env.NODE_ENV === "production" && !configuredSetupToken) {
      return NextResponse.json({ error: "INITIAL_ADMIN_SETUP_TOKEN must be configured before production bootstrap." }, { status: 503 });
    }
    if (configuredSetupToken) {
      const provided = Buffer.from(setupToken);
      const expected = Buffer.from(configuredSetupToken);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return NextResponse.json({ error: "The initial setup token is invalid." }, { status: 403 });
      }
    }

    if (!name || !staffId || !email || !password) {
      return NextResponse.json({ error: "Name, staff ID, email, and password are required." }, { status: 400 });
    }
    if (!staffIdPattern.test(staffId)) {
      return NextResponse.json({ error: "Staff ID must contain 4-32 uppercase letters, numbers, or hyphens." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid university email address is required." }, { status: 400 });
    }
    if (password.length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters long." }, { status: 400 });
    }

    await connectToDatabase();
    const accountCount = await User.countDocuments({ role: { $in: ["staff", "admin"] } });
    if (accountCount > 0) {
      return NextResponse.json({ error: "Initial setup has already been completed. An administrator must provision new accounts." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      studentId: staffId,
      email,
      password: passwordHash,
      role: "admin",
      department,
      status: "active",
      bootstrapKey: "initial-administrator",
    });

    return NextResponse.json({ message: "Initial administrator account created.", user: { id: String(user._id), name: user.name, staffId: user.studentId, email: user.email, role: user.role } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: "Initial setup has already been completed." }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create initial administrator." }, { status: 500 });
  }
}
