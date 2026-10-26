import mongoose from "mongoose";

import Booking from "@/lib/database/models/Booking";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { bookingConflictsWithTimetable, getCampusTimeSlot } from "@/lib/bookingValidation";
import { isBookableLectureRoom, parseTutorialGroup, validateBookingDetails, validateBookingSchedule } from "@/lib/bookingPolicy";
import { bookingAssessmentConflict } from "@/lib/assessmentSchedule";
import { teachingOnDate, campusDateString } from "@/lib/termSchedule";

export class BookingPolicyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BookingPolicyError";
  }
}

export async function studyCircleAttendees(conversationId: string, studentId: mongoose.Types.ObjectId, purpose: string) {
  if (purpose !== "Tutorial Group") throw new BookingPolicyError("Study Circles may request Tutorial Groups only.");
  const db = mongoose.connection.db;
  if (!db) throw new Error("The database connection is unavailable.");
  const circle = await db.collection("conversations").findOne({
    _id: new mongoose.Types.ObjectId(conversationId), type: "group", members: studentId,
  }, { projection: { members: 1 } });
  if (!circle || !Array.isArray(circle.members)) throw new BookingPolicyError("Study Circle not found or you are not a member.", 403);
  const attendees = new Set(circle.members.map(String)).size;
  if (attendees < 50) throw new BookingPolicyError("A Study Circle needs at least 50 members to request a lecture room.", 403);
  return attendees;
}

export async function saveStudentBooking(value: unknown, bookingId?: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BookingPolicyError("A booking request is required.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => ![
    "studentId", "roomId", "purpose", "title", "attendees", "tutorialGroup", "conversationId", "startTime", "endTime",
  ].includes(key)) || typeof body.studentId !== "string" || !body.studentId.trim() || body.studentId.length > 20 ||
      typeof body.roomId !== "string" || !mongoose.isObjectIdOrHexString(body.roomId)) {
    throw new BookingPolicyError("A valid student ID, room ID, and booking details are required.");
  }
  const detailsError = validateBookingDetails(body);
  if (detailsError) throw new BookingPolicyError(detailsError);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i;
  if (typeof body.startTime !== "string" || typeof body.endTime !== "string" ||
      !timestamp.test(body.startTime) || !timestamp.test(body.endTime)) {
    throw new BookingPolicyError("Booking times must be ISO timestamps with a timezone.");
  }
  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  const slot = getCampusTimeSlot(startTime, endTime);
  if (!slot) throw new BookingPolicyError("Choose a same-day booking range with whole-minute times.");
  const requestedAt = new Date();
  const purpose = body.purpose === "Tutorial Group" ? "Tutorial Group" : "Event";
  const scheduleError = validateBookingSchedule(purpose, startTime, endTime, requestedAt);
  if (scheduleError) throw new BookingPolicyError(scheduleError);
  const [student, room] = await Promise.all([
    User.findOne({ studentId: body.studentId.trim().toUpperCase(), role: "student", status: "active" })
      .select("_id enrolledCourses").lean(),
    Room.findById(body.roomId).lean(),
  ]);
  if (!student) throw new BookingPolicyError("Active student account was not found.", 404);
  if (!room) throw new BookingPolicyError("Lecture room was not found.", 404);
  if (!isBookableLectureRoom(room)) throw new BookingPolicyError("Students may book lecture rooms only.", 409);
  if (!room.isAvailable) throw new BookingPolicyError("This lecture room is unavailable.", 409);
  const current = bookingId ? await Booking.findOne({ _id: bookingId, user: student._id }).lean() : null;
  if (bookingId && !current) throw new BookingPolicyError("Booking not found.", 404);
  if (current && (current.status === "cancelled" || current.startTime <= requestedAt)) {
    throw new BookingPolicyError("Cancelled or started bookings cannot be edited. Submit a new request.", 409);
  }
  let attendees = Number(body.attendees);
  const conversationId = body.conversationId;
  if (conversationId !== undefined && conversationId !== null &&
      (typeof conversationId !== "string" || !mongoose.isObjectIdOrHexString(conversationId))) {
    throw new BookingPolicyError("Choose a valid Study Circle.");
  }
  if (current?.conversation && String(current.conversation) !== conversationId) {
    throw new BookingPolicyError("The Study Circle attached to a booking cannot be changed.");
  }
  if (conversationId) {
    attendees = await studyCircleAttendees(String(conversationId), student._id, purpose);
  }
  if ((room.capacity || 0) > 0 && attendees > room.capacity) {
    throw new BookingPolicyError(`This lecture room accommodates at most ${room.capacity} people.`);
  }
  const [allocations, conflictingBooking] = await Promise.all([
    TimetableAllocation.find({
      status: "published", dayOfWeek: slot.dayOfWeek,
      startTime: { $lt: slot.endTime }, endTime: { $gt: slot.startTime },
    }).select("academicYear semester room course dayOfWeek startTime endTime streamStudentIds").lean(),
    Booking.findOne({
      ...(bookingId ? { _id: { $ne: bookingId } } : {}),
      status: { $in: ["pending", "confirmed"] },
      startTime: { $lt: endTime }, endTime: { $gt: startTime },
      $or: [{ room: room._id }, { user: student._id }],
    }).select("_id").lean(),
  ]);
  const courses = new Set((student.enrolledCourses || []).map(String));
  const datedAllocations = await teachingOnDate(allocations, campusDateString(startTime));
  const slots = datedAllocations.map((allocation) => ({
    roomId: String(allocation.room), dayOfWeek: allocation.dayOfWeek, startTime: allocation.startTime, endTime: allocation.endTime,
    studentIds: allocation.streamStudentIds?.length
      ? allocation.streamStudentIds.map(String) : courses.has(String(allocation.course)) ? [String(student._id)] : [],
  }));
  if (conflictingBooking || bookingConflictsWithTimetable(slot, String(room._id), slots, String(student._id))) {
    throw new BookingPolicyError("This lecture room or your timetable is unavailable during the selected time.", 409);
  }
  if (await bookingAssessmentConflict(String(room._id), String(student._id), startTime, endTime)) {
    throw new BookingPolicyError("This lecture room or student is reserved for a dated assessment.", 409);
  }
  const draft = {
    user: student._id, room: room._id, purpose, title: typeof body.title === "string" ? body.title.trim() : "",
    attendees, ...(purpose === "Tutorial Group" ? { tutorialGroup: parseTutorialGroup(body.tutorialGroup) } : {}),
    conversation: conversationId || null, requestedAt, startTime, endTime, status: "pending",
  };
  if (current) {
    return Booking.findOneAndUpdate({ _id: current._id, user: student._id }, {
      $set: draft,
      $unset: { reviewedBy: 1, reviewedAt: 1, cancellationReason: 1, ...(purpose === "Event" ? { tutorialGroup: 1 } : {}) },
    }, { new: true, runValidators: true }).populate("room", "name code building spaceType").lean();
  }
  const booking = await Booking.create(draft);
  return Booking.findById(booking._id).populate("room", "name code building spaceType").lean();
}
