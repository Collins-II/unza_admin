import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      let url = new URL(`../${specifier.slice(2)}.ts`, import.meta.url);
      if (!existsSync(fileURLToPath(url))) url = new URL(`../${specifier.slice(2)}/index.ts`, import.meta.url);
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const studentId = new mongoose.Types.ObjectId();
const roomId = new mongoose.Types.ObjectId();
const bookingId = new mongoose.Types.ObjectId();
const courseId = new mongoose.Types.ObjectId();
const circleId = new mongoose.Types.ObjectId();
const now = Date.parse("2030-01-01T10:00:00Z");
const DAY = 86400000;
const originalDb = mongoose.connection.db;
const originalKey = process.env.STUDENT_APP_API_KEY;
let room, student, current, created, conflictingBooking, allocations, circle, calls, staffRole, activeAllocation, preferredVenue, activeReservation;
const query = (value) => ({
  select() { return this; }, lean: async () => value, populate() { return this; }, sort() { return this; }, limit() { return this; },
});
const moduleMock = (path, value) => mock.module(new URL(path, import.meta.url).href, value);
moduleMock("../lib/database/index.ts", { namedExports: { connectToDatabase: async () => {} } });
moduleMock("../lib/database/models/Room.ts", { defaultExport: {
  findById: () => query(room),
  findByIdAndUpdate(id, update, options) { calls.classification = { id, update, options }; return query({ ...room, ...update }); },
} });
moduleMock("../lib/database/models/Course.ts", { defaultExport: { exists: async () => preferredVenue } });
moduleMock("../lib/database/models/User.ts", { defaultExport: { findOne: () => query(student) } });
moduleMock("../lib/database/models/TimetableAllocation.ts", { defaultExport: {
  find(filter) { calls.timetableFilter = filter; return query(allocations); },
  exists: async () => activeAllocation,
} });
moduleMock("../lib/database/models/Booking.ts", { defaultExport: {
  exists: async () => activeReservation,
  findOne(filter) { calls.bookingFilter = filter; return query(filter.user ? current : conflictingBooking); },
  findById: () => query(created || current),
  async create(draft) { calls.created = draft; created = { _id: bookingId, ...draft }; return created; },
  findOneAndUpdate(filter, update, options) {
    calls.updated = { filter, update, options };
    return query({ ...current, ...update.$set });
  },
  findByIdAndUpdate(id, update, options) {
    calls.updated = { id, update, options };
    return query({ ...current, ...update.$set });
  },
} });
moduleMock("../lib/timetableLock.ts", { namedExports: {
  acquireTimetableConfigurationLock: async () => { calls.locked = true; return { id: "lock" }; },
  releaseTimetableLock: async () => { calls.released = true; },
  renewTimetableLock: async () => {},
} });
moduleMock("../lib/adminAuth.ts", { namedExports: {
  requireAdminRole: async () => ["admin", "staff"].includes(staffRole)
    ? { session: { user: { id: "reviewer", role: staffRole } }, response: null }
    : { session: null, response: Response.json({ error: "University staff access is required." }, { status: 403 }) },
} });
moduleMock("../lib/audit.ts", { namedExports: {
  auditedMutation: async (actor, action, target, details, mutate) => {
    calls.audit = { actor, action, target, details };
    return mutate({ transaction: true });
  },
} });
const { saveStudentBooking } = await import("../lib/studentBookingService.ts");
const collectionApi = await import("../app/api/integration/bookings/route.ts");
const detailApi = await import("../app/api/integration/bookings/[id]/route.ts");
const adminApi = await import("../app/api/admin/bookings/route.ts");
const roomsApi = await import("../app/api/admin/rooms/route.ts");
const draft = (overrides = {}) => ({
  studentId: "2020123456", roomId: String(roomId), purpose: "Tutorial Group", attendees: 10,
  tutorialGroup: { groupName: "Calculus TG", courseCode: "mat101", topic: "Integration", leaderName: "Group leader" },
  startTime: new Date(now + 3 * DAY).toISOString(), endTime: new Date(now + 3 * DAY + 3600000).toISOString(),
  ...overrides,
});
const record = (overrides = {}) => ({
  _id: bookingId, user: studentId, room: roomId, ...draft(), roomId: undefined,
  startTime: new Date(now + 3 * DAY), endTime: new Date(now + 3 * DAY + 3600000),
  createdAt: new Date(now), requestedAt: new Date(now), status: "pending", ...overrides,
});
const request = (body, method = "POST", key = "test-key") => new Request("http://central.test/api/bookings", {
  method, headers: { "Content-Type": "application/json", "x-student-app-key": key }, body: JSON.stringify(body),
});
const review = (status = "confirmed") => adminApi.PATCH(request({ id: String(bookingId), status }, "PATCH"));

beforeEach(() => {
  mock.timers.enable({ apis: ["Date"], now });
  process.env.STUDENT_APP_API_KEY = "test-key";
  calls = {};
  staffRole = "staff";
  student = { _id: studentId, enrolledCourses: [courseId] };
  room = { _id: roomId, spaceType: "lecture_room", isAvailable: true, capacity: 100 };
  current = created = conflictingBooking = null;
  allocations = [];
  activeAllocation = preferredVenue = activeReservation = null;
  circle = { members: Array.from({ length: 50 }, () => new mongoose.Types.ObjectId()) };
  mongoose.connection.db = { collection: () => ({
    findOne: async (filter) => { calls.circleFilter = filter; return circle; },
  }) };
});
afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  mongoose.connection.db = originalDb;
  if (originalKey === undefined) delete process.env.STUDENT_APP_API_KEY;
  else process.env.STUDENT_APP_API_KEY = originalKey;
});

test("integration authentication rejects requests before acquiring the schedule lock", async () => {
  assert.equal((await collectionApi.POST(request(draft(), "POST", "wrong-key"))).status, 401);
  assert.equal(calls.locked, undefined);
});

test("central creation validates details, forces pending, records submission and releases the lock", async () => {
  const response = await collectionApi.POST(request(draft()));
  assert.equal(response.status, 201);
  assert.equal(calls.created.status, "pending");
  assert.equal(calls.created.requestedAt.getTime(), now);
  assert.equal(calls.created.tutorialGroup.courseCode, "MAT101");
  assert.equal(calls.released, true);
  assert.equal((await collectionApi.POST(request(draft({ status: "confirmed" })))).status, 400);
});

test("central creation rejects non-lecture rooms, missing students, capacity overflow and insufficient notice", async () => {
  room.spaceType = "laboratory";
  await assert.rejects(saveStudentBooking(draft()), /lecture rooms only/);
  room.spaceType = "lecture_room";
  room.capacity = 5;
  await assert.rejects(saveStudentBooking(draft()), /at most 5/);
  room.capacity = 100;
  student = null;
  await assert.rejects(saveStudentBooking(draft()), /Active student/);
  student = { _id: studentId };
  await assert.rejects(saveStudentBooking(draft({
    startTime: new Date(now + DAY).toISOString(), endTime: new Date(now + DAY + 3600000).toISOString(),
  })), /48 hours/);
  assert.equal(calls.created, undefined);
});

test("central creation rejects room, explicit personal, legacy enrollment and active booking conflicts", async () => {
  const slot = { room: roomId, course: courseId, dayOfWeek: "Friday", startTime: "12:00", endTime: "13:00" };
  for (const allocation of [
    slot,
    { ...slot, room: new mongoose.Types.ObjectId(), streamStudentIds: [studentId] },
    { ...slot, room: new mongoose.Types.ObjectId(), streamStudentIds: [] },
  ]) {
    allocations = [allocation];
    await assert.rejects(saveStudentBooking(draft()), /timetable is unavailable/);
  }
  allocations = [];
  conflictingBooking = { _id: new mongoose.Types.ObjectId() };
  await assert.rejects(saveStudentBooking(draft()), /timetable is unavailable/);
  assert.equal(calls.created, undefined);
});

test("editing a confirmed booking renews the request and clears approval metadata", async () => {
  current = record({ status: "confirmed", requestedAt: new Date(now - DAY) });
  const result = await saveStudentBooking(draft(), String(bookingId));
  assert.equal(result.status, "pending");
  assert.equal(calls.updated.update.$set.requestedAt.getTime(), now);
  assert.deepEqual(calls.updated.update.$unset, { reviewedBy: 1, reviewedAt: 1, cancellationReason: 1 });
  assert.deepEqual(calls.bookingFilter._id, { $ne: String(bookingId) });
});

test("student cancellation is owned, retains the record and cannot cancel started bookings", async () => {
  const context = { params: Promise.resolve({ id: String(bookingId) }) };
  current = record();
  assert.equal((await detailApi.PATCH(request({ studentId: "2020123456" }, "PATCH"), context)).status, 200);
  assert.equal(calls.updated.update.$set.cancellationReason, "student_cancelled");
  assert.equal(String(calls.updated.filter.user), String(studentId));
  current.startTime = new Date(now - 1);
  assert.equal((await detailApi.PATCH(request({ studentId: "2020123456" }, "PATCH"), context)).status, 409);
});

test("only authorized staff can review; approval uses original submission time and audit transaction", async () => {
  current = record();
  staffRole = "student";
  assert.equal((await review()).status, 403);
  assert.equal(calls.updated, undefined);
  staffRole = "staff";
  mock.timers.setTime(now + 2.5 * DAY);
  assert.equal((await review()).status, 200);
  assert.equal(calls.updated.update.$set.reviewedBy, "reviewer");
  assert.equal(calls.audit.action, "booking.confirmed");
  assert.deepEqual(calls.updated.options.session, { transaction: true });
  assert.equal(calls.released, true);
});

test("incomplete legacy requests cannot be approved but can be cancelled", async () => {
  current = record({ tutorialGroup: undefined });
  assert.equal((await review()).status, 409);
  assert.equal((await review("cancelled")).status, 200);
  assert.equal(calls.updated.update.$set.cancellationReason, "staff_cancelled");
});

test("approval rechecks current timetable and Study Circle membership and capacity", async () => {
  current = record({ conversation: circleId });
  circle = null;
  assert.equal((await review()).status, 403);
  circle = { members: Array.from({ length: 50 }, () => new mongoose.Types.ObjectId()) };
  room.capacity = 49;
  assert.equal((await review()).status, 409);
  room.capacity = 100;
  allocations = [{ room: roomId, dayOfWeek: "Friday", startTime: "12:00", endTime: "13:00" }];
  assert.equal((await review()).status, 409);
  assert.equal(calls.updated, undefined);
});

test("staff can explicitly classify legacy rooms and the update is persisted with validation", async () => {
  delete room.spaceType;
  await assert.rejects(saveStudentBooking(draft()), /lecture rooms only/);
  activeAllocation = { _id: "existing-legacy-allocation" };
  preferredVenue = { _id: "existing-course" };
  const response = await roomsApi.PATCH(request({ id: String(roomId), spaceType: "lecture_room" }, "PATCH"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).room.spaceType, "lecture_room");
  assert.equal(calls.classification.id, String(roomId));
  assert.deepEqual(calls.classification.update, { spaceType: "lecture_room" });
  assert.equal(calls.classification.options.runValidators, true);
  assert.equal(calls.released, true);
});

test("room classification rejects students, invalid types and changes that break existing schedules or bookings", async () => {
  const classify = (spaceType) => roomsApi.PATCH(request({ id: String(roomId), spaceType }, "PATCH"));
  staffRole = "student";
  assert.equal((await classify("library")).status, 403);
  staffRole = "staff";
  assert.equal((await classify("arbitrary type")).status, 400);
  activeAllocation = { _id: "class" };
  assert.equal((await classify("library")).status, 409);
  activeAllocation = null;
  preferredVenue = { _id: "course" };
  assert.equal((await classify("library")).status, 409);
  preferredVenue = null;
  activeReservation = { _id: "reservation" };
  assert.equal((await classify("library")).status, 409);
  assert.equal(calls.classification, undefined);
});
