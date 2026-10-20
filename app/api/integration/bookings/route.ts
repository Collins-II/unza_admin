import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import User from "@/lib/database/models/User";
import "@/lib/database/models/Room";
import { BookingPolicyError, saveStudentBooking } from "@/lib/studentBookingService";
import { acquireTimetableConfigurationLock, releaseTimetableLock } from "@/lib/timetableLock";
import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;
  try {
    const studentId = new URL(request.url).searchParams.get("studentId")?.trim().toUpperCase();
    if (!studentId) return NextResponse.json({ error: "Student ID is required." }, { status: 400, headers: NO_STORE });
    await connectToDatabase();
    const student = await User.findOne({ studentId, role: "student", status: "active" }).select("_id").lean();
    if (!student) return NextResponse.json({
      error: "Active student account was not found.",
      code: "STUDENT_NOT_FOUND",
    }, { status: 404, headers: NO_STORE });
    const bookings = await Booking.find({ user: student._id }).populate("room", "name code building spaceType").sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({ studentId, bookings }, { headers: NO_STORE });
  } catch (error) {
    console.error("Student bookings retrieval failed:", error);
    return NextResponse.json({ error: "Unable to load student bookings." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;
  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const body: unknown = await request.json();
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Room schedules are being updated. Please retry shortly." }, { status: 409, headers: NO_STORE });
    const booking = await saveStudentBooking(body);
    return NextResponse.json({ booking }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof BookingPolicyError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof BookingPolicyError ? error.status : 400, headers: NO_STORE });
    }
    console.error("Student booking creation failed:", error);
    return NextResponse.json({ error: "Unable to create booking." }, { status: 500, headers: NO_STORE });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
