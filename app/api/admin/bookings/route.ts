import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { isBookableLectureRoom, isBookingPurpose, validateBookingDetails, validateBookingSchedule } from "@/lib/bookingPolicy";
import { auditedMutation } from "@/lib/audit";
import { bookingConflictsWithTimetable, getCampusTimeSlot } from "@/lib/bookingValidation";
import { acquireTimetableConfigurationLock, releaseTimetableLock } from "@/lib/timetableLock";
import { BookingPolicyError, studyCircleAttendees } from "@/lib/studentBookingService";

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const bookings = await Booking.find().populate("user", "name studentId email").populate("room", "name code building").sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({ bookings });
  } catch (error) {
    console.error("Admin bookings retrieval failed:", error);
    return NextResponse.json({ error: "Unable to load bookings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !["id", "status"].includes(key)) ||
        typeof body.id !== "string" || !mongoose.isValidObjectId(body.id) ||
        !["pending", "confirmed", "cancelled"].includes(body.status)) {
      return NextResponse.json({ error: "Booking id and valid status are required." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Room schedules are being updated. Please retry shortly." }, { status: 409 });
    const current = await Booking.findById(body.id).lean();
    if (!current) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    let attendees = current.attendees;
    if (body.status !== "cancelled") {
      const detailsError = validateBookingDetails(current);
      if (detailsError || !isBookingPurpose(current.purpose)) {
        return NextResponse.json({ error: detailsError || "Invalid booking purpose. Ask the student to submit a complete request." }, { status: 409 });
      }
      const scheduleError = validateBookingSchedule(current.purpose, current.startTime, current.endTime, current.requestedAt || current.createdAt);
      if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 409 });
      const slot = getCampusTimeSlot(current.startTime, current.endTime);
      if (!slot || current.startTime <= new Date()) {
        return NextResponse.json({ error: "Only valid future bookings can be made active." }, { status: 409 });
      }
      const [room, student, overlappingBooking, allocations] = await Promise.all([
        Room.findById(current.room).lean(),
        User.findOne({ _id: current.user, role: "student", status: "active" }).select("enrolledCourses").lean(),
        Booking.findOne({
          _id: { $ne: current._id },
          status: { $in: ["pending", "confirmed"] },
          startTime: { $lt: current.endTime },
          endTime: { $gt: current.startTime },
          $or: [{ room: current.room }, { user: current.user }],
        }).select("_id").lean(),
        TimetableAllocation.find({
          status: "published",
          dayOfWeek: slot.dayOfWeek,
          startTime: { $lt: slot.endTime },
          endTime: { $gt: slot.startTime },
        }).select("room course dayOfWeek startTime endTime streamStudentIds").lean(),
      ]);
      if (!student) return NextResponse.json({ error: "The requester must be an active student." }, { status: 409 });
      if (!room || !room.isAvailable) return NextResponse.json({ error: "This room is currently unavailable." }, { status: 409 });
      if (!isBookableLectureRoom(room)) return NextResponse.json({ error: "Students may book lecture rooms only." }, { status: 409 });
      if (current.conversation) attendees = await studyCircleAttendees(String(current.conversation), current.user, current.purpose);
      if ((room.capacity || 0) > 0 && attendees > room.capacity) {
        return NextResponse.json({ error: "Expected attendees exceed the lecture room capacity." }, { status: 409 });
      }
      const enrolledCourses = new Set((student.enrolledCourses || []).map(String));
      const timetableSlots = allocations.map((allocation) => ({
        roomId: String(allocation.room),
        dayOfWeek: allocation.dayOfWeek,
        startTime: allocation.startTime,
        endTime: allocation.endTime,
        studentIds: allocation.streamStudentIds?.length
          ? allocation.streamStudentIds.map(String) : enrolledCourses.has(String(allocation.course)) ? [String(current.user)] : [],
      }));
      if (overlappingBooking || bookingConflictsWithTimetable(slot, String(current.room), timetableSlots, String(current.user))) {
        return NextResponse.json({ error: "This room or the student's timetable is unavailable during the selected time." }, { status: 409 });
      }
    }
    const update = body.status === "cancelled"
      ? { $set: { status: body.status, cancellationReason: "staff_cancelled" } }
      : { $set: { status: body.status, attendees }, $unset: { cancellationReason: 1 } };
    const booking = await auditedMutation(access.session.user.id, `booking.${body.status}`, body.id, {
      purpose: current.purpose, studentId: String(current.user),
    }, (session) => Booking.findByIdAndUpdate(body.id, {
      ...update, $set: { ...update.$set, reviewedBy: access.session.user.id, reviewedAt: new Date() },
    }, { new: true, runValidators: true, session }).lean());
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    return NextResponse.json({ booking });
  } catch (error) {
    if (error instanceof BookingPolicyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Admin booking review failed:", error);
    return NextResponse.json({ error: "Unable to update booking." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
