import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import User from "@/lib/database/models/User";
import { acquireTimetableConfigurationLock, releaseTimetableLock } from "@/lib/timetableLock";
import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";
import { BookingPolicyError, saveStudentBooking } from "@/lib/studentBookingService";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request, context: RouteContext<"/api/integration/bookings/[id]">) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;

  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!mongoose.isValidObjectId(id) || !body || typeof body !== "object" || Array.isArray(body) ||
        typeof body.studentId !== "string" || !body.studentId.trim()) {
      return NextResponse.json({ error: "A valid booking ID and student ID are required." }, { status: 400, headers: NO_STORE });
    }

    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Room schedules are being updated. Please retry shortly." }, { status: 409, headers: NO_STORE });

    if (Object.keys(body).some((key) => key !== "studentId")) {
      const booking = await saveStudentBooking(body, id);
      return NextResponse.json({ booking }, { headers: NO_STORE });
    }
    const student = await User.findOne({
      studentId: body.studentId.trim().toUpperCase(),
      role: "student",
      status: "active",
    }).select("_id").lean();
    if (!student) return NextResponse.json({ error: "Active student account was not found." }, { status: 404, headers: NO_STORE });
    const current = await Booking.findOne({ _id: id, user: student._id }).lean();
    if (!current) return NextResponse.json({ error: "Booking not found." }, { status: 404, headers: NO_STORE });
    if (current.status !== "cancelled" && current.startTime <= new Date()) {
      return NextResponse.json({ error: "Bookings cannot be cancelled after they have started." }, { status: 409, headers: NO_STORE });
    }

    const booking = current.status === "cancelled"
      ? current
      : await Booking.findOneAndUpdate(
        { _id: id, user: student._id },
        { $set: { status: "cancelled", cancellationReason: "student_cancelled" } },
        { new: true, runValidators: true }
      ).populate("room", "name code building spaceType").lean();
    return NextResponse.json({ booking }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof BookingPolicyError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof BookingPolicyError ? error.status : 400, headers: NO_STORE });
    }
    console.error("Student booking update failed:", error);
    return NextResponse.json({ error: "Unable to update booking." }, { status: 500, headers: NO_STORE });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
