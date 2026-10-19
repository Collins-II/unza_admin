import bcrypt from "bcryptjs";

import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";
import { failedLoginUpdate } from "@/lib/loginAttempts";

// Used to keep response time similar when the student ID does not exist.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.rJq3yH0k2WZ6s2z0bEw1q5yQe4yO";

export type StudentLoginResult =
  | { ok: true; student: { id: string; studentId: string; name: string; email: string; program?: string; year?: string; department?: string; mustChangePassword: boolean } }
  | { ok: false; reason: "invalid" | "locked" };

/** Student sign-in is by assigned student ID only; email and staff accounts are never accepted. */
export async function verifyStudentCredentials(studentId: unknown, password: unknown): Promise<StudentLoginResult> {
  const id = typeof studentId === "string" ? studentId.trim().toUpperCase() : "";
  if (!id || typeof password !== "string" || !password || password.length > 200) return { ok: false, reason: "invalid" };

  await connectToDatabase();
  const user = await User.findOne({ studentId: id, role: "student", status: "active" })
    .select("+password +failedLoginAttempts +lockedUntil name studentId email program year department mustChangePassword");
  if (!user || !user.password?.startsWith("$2")) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return { ok: false, reason: "locked" };

  if (!(await bcrypt.compare(password, user.password))) {
    const updated = await User.findOneAndUpdate({
      _id: user._id, password: user.password,
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: new Date() } }],
    }, failedLoginUpdate(), { new: true, updatePipeline: true }).select("+lockedUntil");
    return { ok: false, reason: updated?.lockedUntil && updated.lockedUntil.getTime() > Date.now() ? "locked" : "invalid" };
  }

  const confirmed = await User.updateOne({
    _id: user._id, password: user.password, role: "student", status: "active",
    $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: new Date() } }],
  }, { $set: { failedLoginAttempts: 0 }, $unset: { lockedUntil: 1 } });
  if (confirmed.matchedCount !== 1) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    student: {
      id: String(user._id),
      studentId: user.studentId,
      name: user.name,
      email: user.email,
      program: user.program,
      year: user.year,
      department: user.department,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
  };
}
