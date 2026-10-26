import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") return next("next/server.js", context);
    if (specifier.startsWith("@/")) {
      let url = new URL(`../${specifier.slice(2)}.ts`, import.meta.url);
      if (!existsSync(fileURLToPath(url))) url = new URL(`../${specifier.slice(2)}/index.ts`, import.meta.url);
      return next(url.href, context);
    }
    return next(specifier, context);
  },
});
const id = () => new mongoose.Types.ObjectId();
const departmentId = id(), courseId = id(), roomId = id(), studentId = id(), invigilatorId = id();
let department, course, room, roster, people, teaching, assessments, bookings, current, locked, role, audits, created, approvedTerm, review;
const query = (value) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  skip() { return this; }, limit() { return this; }, maxTimeMS() { return this; },
  lean: async () => value,
});
const moduleMock = (path, options) => mock.module(new URL(path, import.meta.url).href, options);
moduleMock("../lib/database/index.ts", { namedExports: { connectToDatabase: async () => {} } });
moduleMock("../lib/adminAuth.ts", { namedExports: {
  departmentScope: () => ({}), departmentDenied: () => null,
  requireSystemAdmin: async () => role === "admin" ? { session: { user: { id: String(invigilatorId), role } }, response: null }
    : { session: null, response: Response.json({ error: "Administrator required." }, { status: 403 }) },
  requireAdminRole: async () => role ? { session: { user: { id: String(invigilatorId), role } }, response: null }
    : { session: null, response: Response.json({ error: "Authentication required." }, { status: 401 }) },
} });
class AcademicCalendarError extends Error { constructor(message, status = 409) { super(message); this.status = status; } }
moduleMock("../lib/academicCalendarService.ts", { namedExports: {
  AcademicCalendarError,
  requireApprovedTerm: async () => {
    if (!approvedTerm) throw new AcademicCalendarError("Approve this term's calendar first.");
    return approvedTerm;
  },
} });
moduleMock("../lib/database/models/AcademicTerm.ts", { defaultExport: { find: () => query([]) } });
moduleMock("../lib/timetableLock.ts", { namedExports: {
  acquireTimetableMutationLock: async () => locked ? null : { configuration: {}, term: {} },
  acquireTimetableConfigurationLock: async () => locked ? null : {},
  releaseTimetableLock: async () => {}, renewTimetableLock: async () => {},
  releaseTimetableMutationLock: async () => {}, renewTimetableMutationLock: async () => {},
} });
moduleMock("../lib/audit.ts", { namedExports: {
  auditedMutation: async (actor, action, target, details, mutate) => {
    const result = await mutate({});
    audits.push({ actor, action, target, details });
    return result;
  },
} });
moduleMock("../lib/database/models/Department.ts", { defaultExport: { findById: () => query(department) } });
moduleMock("../lib/database/models/Course.ts", { defaultExport: { findById: () => query(course) } });
moduleMock("../lib/database/models/Room.ts", { defaultExport: { findById: () => query(room) } });
moduleMock("../lib/database/models/User.ts", { defaultExport: {
  findById: () => query({ _id: invigilatorId, role, status: "active", departmentIds: [departmentId] }),
  find: (filter) => query(filter.role === "student" ? roster : people),
} });
moduleMock("../lib/database/models/TimetableAllocation.ts", { defaultExport: { find: () => query(teaching) } });
moduleMock("../lib/database/models/Booking.ts", { defaultExport: { find: () => query(bookings) } });
moduleMock("../lib/database/models/PublicationRequest.ts", { defaultExport: {
  findOne: () => query(review?.status === "pending" ? review : null),
  updateOne: async () => { review.status = "approved"; return { modifiedCount: 1 }; },
} });
moduleMock("../lib/database/models/AssessmentAllocation.ts", { defaultExport: {
  find: (filter) => query(typeof filter._id === "string" || filter._id instanceof mongoose.Types.ObjectId ? [current].filter(Boolean) : assessments.filter((row) => row.status !== "cancelled" && (!filter.date || row.date === filter.date))),
  countDocuments: async () => assessments.length,
  findById: () => query(current),
  create: async ([value]) => {
    created = { __v: 0, ...value };
    return [{ toObject: () => created }];
  },
  findOneAndUpdate: (filter, update) => {
    if (!current || current.__v !== filter.__v) return query(null);
    current = { ...current, ...update.$set, __v: current.__v + 1 };
    if (update.$addToSet?.preparedBy) current.preparedBy = [...new Set([...(current.preparedBy || []).map(String), String(update.$addToSet.preparedBy)])];
    return query(current);
  },
} });
const api = await import("../app/api/admin/assessments/route.ts");
const approvalsApi = await import("../app/api/admin/approvals/route.ts");
const { publicationSnapshot } = await import("../lib/publicationService.ts");
const { teachingAssessmentConflict, bookingAssessmentConflict } = await import("../lib/assessmentSchedule.ts");
const payload = (overrides = {}) => ({
  academicYear: "2025/2026", semester: "Semester 1", department: String(departmentId), course: String(courseId),
  room: String(roomId), title: "Economics test", assessmentType: "test", date: "2026-10-26",
  startTime: "09:00", endTime: "10:00", invigilatorIds: [String(invigilatorId)], ...overrides,
});
const request = (body, method = "POST") => new Request("http://central.test/api/admin/assessments", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const other = (overrides = {}) => ({
  _id: id(), academicYear: "2026/2027", semester: "Semester 2", date: "2026-10-26",
  startTime: "09:30", endTime: "10:30", room: id(), studentIds: [], invigilatorIds: [], status: "draft", ...overrides,
});
beforeEach(() => {
  department = { _id: departmentId, active: true };
  course = { _id: courseId, department: departmentId, active: true, catalogueOnly: false, semester: "Semester 1" };
  room = { _id: roomId, isAvailable: true, capacity: 1, spaceType: "lecture_room" };
  roster = [{ _id: studentId, enrolledCourses: [courseId] }];
  people = [{ _id: invigilatorId, name: "Phiri C" }];
  teaching = []; assessments = []; bookings = []; audits = [];
  current = null; locked = false; role = "staff"; created = null;
  review = null;
  approvedTerm = { teachingStartDate: "2026-09-01", teachingEndDate: "2026-10-20", assessmentStartDate: "2026-10-21", assessmentEndDate: "2026-11-01", status: "approved" };
});
test("assessment dates require approval and must lie within the approved window", async () => {
  approvedTerm = null;
  assert.equal((await api.POST(request(payload()))).status, 409);
  approvedTerm = { teachingStartDate: "2026-09-01", teachingEndDate: "2026-10-01", assessmentStartDate: "2026-10-02", assessmentEndDate: "2026-10-25", status: "approved" };
  assert.equal((await api.POST(request(payload()))).status, 409);
  assert.equal(created, null);
});

test("unauthenticated assessment creation is rejected before persistence", async () => {
  role = null;
  assert.equal((await api.POST(request(payload()))).status, 401);
  assert.equal(created, null);
});
test("full-roster assessment is a draft at exact room capacity and is audited", async () => {
  const response = await api.POST(request(payload()));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.allocation.status, "draft");
  assert.equal(result.allocation.studentCount, 1);
  assert.equal(result.allocation.studentIds, undefined);
  assert.equal(audits[0].action, "assessment.create");
  assert.equal(String(created.studentIds[0]), String(studentId));
});
test("capacity overflow and invalid student selections are rejected without a write", async () => {
  room.capacity = 0;
  assert.equal((await api.POST(request(payload()))).status, 409);
  room.capacity = 1;
  assert.equal((await api.POST(request(payload({ studentIds: [String(id())] })))).status, 409);
  assert.equal(created, null);
});
test("ineligible references and unavailable invigilators are rejected", async () => {
  course.catalogueOnly = true;
  assert.equal((await api.POST(request(payload()))).status, 409);
  course.catalogueOnly = false;
  people = [];
  assert.equal((await api.POST(request(payload()))).status, 409);
  people = [{ _id: invigilatorId }];
  room.spaceType = "office";
  assert.equal((await api.POST(request(payload()))).status, 409);
});
test("same-date room, student or invigilator conflicts span all planning terms", async () => {
  for (const resource of [{ room: roomId }, { studentIds: [studentId] }, { invigilatorIds: [invigilatorId] }]) {
    assessments = [other(resource)];
    const response = await api.POST(request(payload()));
    assert.equal(response.status, 409, JSON.stringify(resource));
  }
  assert.equal(created, null);
});
test("adjacent and different-date assessments do not conflict", async () => {
  assessments = [other({ room: roomId, startTime: "10:00", endTime: "11:00" })];
  assert.equal((await api.POST(request(payload()))).status, 201);
  assessments = [other({ room: roomId, date: "2026-10-27" })];
  assert.equal((await api.POST(request(payload()))).status, 201);
});
test("published teaching blocks a shared student or known teaching invigilator", async () => {
  teaching = [{ room: id(), course: courseId, startTime: "09:30", endTime: "10:30", streamStudentIds: [studentId] }];
  assert.equal((await api.POST(request(payload()))).status, 409);
  teaching = [{ room: id(), course: id(), lecturer: "Phiri C", startTime: "09:30", endTime: "10:30", streamStudentIds: [id()] }];
  assert.equal((await api.POST(request(payload()))).status, 409);
});
test("confirmed booking blocks an assessment using Lusaka timestamps", async () => {
  bookings = [{ room: roomId, user: id(), startTime: new Date("2026-10-26T07:30:00Z"), endTime: new Date("2026-10-26T08:30:00Z") }];
  assert.equal((await api.POST(request(payload()))).status, 409);
});
test("concurrent configuration lock and stale version edits fail explicitly", async () => {
  locked = true;
  assert.equal((await api.POST(request(payload()))).status, 409);
  locked = false;
  current = { _id: id(), __v: 1, ...payload(), studentIds: [studentId], invigilatorIds: [invigilatorId], status: "draft" };
  assert.equal((await api.PATCH(request({ id: String(current._id), expectedVersion: 0, status: "published" }, "PATCH"))).status, 409);
  assert.equal(audits.length, 0);
});
test("staff cannot publish and draft cancellation remains possible after reference removal", async () => {
  current = { _id: id(), __v: 0, ...payload(), studentIds: [studentId], invigilatorIds: [invigilatorId], status: "draft" };
  const patch = (status) => api.PATCH(request({ id: String(current._id), expectedVersion: current.__v, status }, "PATCH"));
  room.capacity = 0;
  assert.equal((await patch("published")).status, 403);
  course = null; room = null;
  assert.equal((await patch("cancelled")).status, 200);
  assert.equal(current.status, "cancelled");
  assert.equal(audits[0].action, "assessment.cancelled");
});
test("independent assessment approval dispatch revalidates capacity, roster and conflicts before publishing", async () => {
  role = "admin";
  current = { _id: id(), __v: 0, ...payload(), studentIds: [studentId], invigilatorIds: [invigilatorId], status: "draft" };
  const snapshot = await publicationSnapshot("assessment", String(current._id), current.academicYear, current.semester);
  review = { _id: id(), kind: "assessment", target: current._id, academicYear: current.academicYear, semester: current.semester, status: "pending", submittedBy: id(), snapshot: snapshot.hash };
  const decide = () => approvalsApi.PATCH(request({ id: String(review._id), decision: "approve" }, "PATCH"));
  room.capacity = 0;
  assert.equal((await decide()).status, 409);
  room.capacity = 1; roster = [];
  assert.equal((await decide()).status, 409);
  roster = [{ _id: studentId, enrolledCourses: [courseId] }];
  assessments = [other({ room: roomId })];
  assert.equal((await decide()).status, 409);
  assert.equal(current.status, "draft");
  assert.equal(review.status, "pending");
  assert.equal(audits.length, 0);
  assessments = [];
  const result = await decide();
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
  assert.equal(current.status, "published");
  assert.equal(review.status, "approved");
  assert.equal(audits[0].action, "assessment.published");
});
test("publishing cannot edit the submitted snapshot in the same request", async () => {
  role = "admin";
  current = { _id: id(), __v: 0, ...payload(), studentIds: [studentId], invigilatorIds: [invigilatorId], status: "draft" };
  assert.equal((await api.PATCH(request({
    id: String(current._id), expectedVersion: 0, status: "published", title: "Changed after review", approvalId: String(id()),
  }, "PATCH"))).status, 400);
  assert.equal(current.title, "Economics test");
  assert.equal(audits.length, 0);
});
test("assessment roster snapshots survive ordinary rescheduling", async () => {
  current = { _id: id(), __v: 0, ...payload(), studentIds: [studentId], invigilatorIds: [invigilatorId], status: "draft" };
  const response = await api.PATCH(request({
    id: String(current._id), expectedVersion: 0, status: "draft", date: "2026-10-27",
  }, "PATCH"));
  assert.equal(response.status, 200);
  assert.equal(current.date, "2026-10-27");
  assert.equal(String(current.studentIds[0]), String(studentId));
  assert.equal(current.__v, 1);
  assert.deepEqual(current.preparedBy, [String(invigilatorId)]);
});
test("teaching publication and booking confirmation cannot override draft assessment reservations", async () => {
  assessments = [other({ room: roomId })];
  assert.equal(await teachingAssessmentConflict([{ roomId: String(roomId), dayOfWeek: "Monday", startTime: "09:00", endTime: "10:00" }]), true);
  assert.equal(await teachingAssessmentConflict([{ roomId: String(roomId), dayOfWeek: "Tuesday", startTime: "09:00", endTime: "10:00" }]), false);
  assert.equal(await bookingAssessmentConflict(String(roomId), String(studentId), new Date("2026-10-26T07:00:00Z"), new Date("2026-10-26T08:00:00Z")), true);
  assert.equal(await bookingAssessmentConflict(String(roomId), String(studentId), new Date("2026-10-27T07:00:00Z"), new Date("2026-10-27T08:00:00Z")), false);
});
test("malformed fields, invalid dates and direct publication on creation are rejected", async () => {
  for (const overrides of [{ room: { $ne: null } }, { date: "2026-02-30" }, { status: "published" }, { invigilatorIds: [] }]) {
    assert.equal((await api.POST(request(payload(overrides)))).status, 400);
  }
  assert.equal(created, null);
});
