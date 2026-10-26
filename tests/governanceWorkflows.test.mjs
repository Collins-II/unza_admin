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
const id = () => String(new mongoose.Types.ObjectId());
const actorId = id(), authorId = id(), departmentId = id(), targetId = id(), reviewId = id();
let principal, session, rows, review, term, revokeOnLock;
const query = (value) => ({
  select() { return this; }, sort() { return this; }, session() { return this; }, populate() { return this; }, limit() { return this; },
  lean: async () => value,
});
const moduleMock = (path, options) => mock.module(new URL(path, import.meta.url).href, options);
mock.module("next-auth", { namedExports: { getServerSession: async () => session } });
moduleMock("../lib/authOptions.ts", { namedExports: { authOptions: {} } });
moduleMock("../lib/database/index.ts", { namedExports: { connectToDatabase: async () => {} } });
moduleMock("../lib/timetableLock.ts", { namedExports: {
  acquireTimetableConfigurationLock: async () => {
    if (revokeOnLock) { principal.role = "staff"; principal.departmentIds = []; }
    return { key: "test", token: "test" };
  },
  releaseTimetableLock: async () => {}, renewTimetableLock: async () => {},
} });
moduleMock("../lib/database/models/User.ts", { defaultExport: { findById: () => query(principal) } });
moduleMock("../lib/database/models/Department.ts", { defaultExport: { find: () => query([{ code: "UNZA-HSS-ECON" }]) } });
moduleMock("../lib/database/models/TimetableAllocation.ts", { defaultExport: { find: () => query(rows) } });
moduleMock("../lib/database/models/AssessmentAllocation.ts", { defaultExport: { find: () => query(rows) } });
moduleMock("../lib/database/models/AcademicTerm.ts", { defaultExport: {
  find: () => query(term ? [term] : []), findOne: () => query(term),
} });
moduleMock("../lib/database/models/PublicationRequest.ts", { defaultExport: {
  findById: () => query(review),
  findOne: (filter) => query(review && review.kind === filter.kind && review.target === filter.target &&
    review.academicYear === filter.academicYear && review.semester === filter.semester && review.status === "pending" ? review : null),
  updateOne: async (filter, update) => {
    if (!review || review.status !== "pending") return { modifiedCount: 0 };
    review = { ...review, ...update.$set };
    return { modifiedCount: 1 };
  },
} });
const { requireAdminRole, requireSystemAdmin, departmentDenied, departmentScope } = await import("../lib/adminAuth.ts");
const { publicationSnapshot, validatePublicationReview, completePublicationReview } = await import("../lib/publicationService.ts");
const { teachingOnDate } = await import("../lib/termSchedule.ts");
const { requireApprovedTerm } = await import("../lib/academicCalendarService.ts");
const approvalsApi = await import("../app/api/admin/approvals/route.ts");
const accessApi = await import("../app/api/admin/access/route.ts");
const detailsApi = await import("../app/api/admin/approvals/detail/route.ts");
beforeEach(() => {
  principal = { role: "staff", status: "active", departmentIds: [departmentId] };
  session = { user: { id: actorId, role: "admin" } };
  rows = [{ _id: targetId, department: departmentId, academicYear: "2026", semester: "Semester 1", status: "draft", createdBy: authorId, startTime: "09:00", endTime: "10:00" }];
  review = null;
  revokeOnLock = false;
  term = { _id: id(), __v: 0, academicYear: "2026", semester: "Semester 1", status: "approved", teachingStartDate: "2026-09-01", teachingEndDate: "2026-10-20", assessmentStartDate: "2026-10-21", assessmentEndDate: "2026-11-01" };
});

test("departmental authorization revalidates current role, scope and account status", async () => {
  const allowed = await requireAdminRole({ departmental: true });
  assert.equal(allowed.response, null);
  assert.equal(allowed.session.user.role, "staff");
  assert.deepEqual(allowed.session.user.departmentIds, [departmentId]);
  assert.equal(departmentDenied(allowed.session.user, departmentId), null);
  assert.equal(departmentDenied(allowed.session.user, id()).status, 403);
  assert.deepEqual(departmentScope(allowed.session.user), { department: { $in: [departmentId] } });
  principal.departmentIds = [];
  assert.equal((await requireAdminRole({ departmental: true })).response.status, 403);
  principal.departmentIds = [departmentId]; principal.status = "inactive";
  assert.equal((await requireAdminRole({ departmental: true })).response.status, 403);
});
test("central writes are administrator-only even for assigned staff and stale administrator cookies", async () => {
  assert.equal((await requireAdminRole()).response.status, 403);
  assert.equal((await requireSystemAdmin()).response.status, 403);
  principal.role = "admin";
  assert.equal((await requireSystemAdmin()).response, null);
  assert.deepEqual(departmentScope({ role: "admin" }), {});
});
test("missing sessions cannot access departmental data", async () => {
  session = null;
  assert.equal((await requireAdminRole({ departmental: true })).response.status, 401);
});
test("waiting mutations revalidate permissions after acquiring the configuration lock", async () => {
  revokeOnLock = true;
  const request = (body) => new Request("http://central.test/api/admin/access", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await approvalsApi.POST(request({ kind: "teaching", id: targetId }))).status, 403);
  principal = { role: "admin", status: "active", departmentIds: [] };
  assert.equal((await accessApi.PATCH(request({ id: authorId, departmentIds: [departmentId], expectedVersion: 0 }))).status, 403);
});
test("review details reject foreign department access and never silently truncate large submissions", async () => {
  review = { kind: "teaching", target: targetId, department: id(), academicYear: "2026", semester: "Semester 1" };
  const request = new Request(`http://central.test/api/admin/approvals/detail?id=${reviewId}`);
  assert.equal((await detailsApi.GET(request)).status, 403);
  principal.role = "admin";
  rows = Array.from({ length: 501 }, (_, index) => ({ _id: index, status: "draft" }));
  const response = await detailsApi.GET(request);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /500-session/);
});
async function submit(kind = "teaching") {
  const snapshot = await publicationSnapshot(kind, targetId, "2026", "Semester 1");
  review = { _id: reviewId, kind, target: targetId, academicYear: "2026", semester: "Semester 1", status: "pending", submittedBy: authorId, snapshot: snapshot.hash };
}
test("separate administrator can approve the exact submitted draft and mark the request in its transaction", async () => {
  await submit();
  assert.equal(await validatePublicationReview(reviewId, { id: actorId, role: "admin" }, "teaching", targetId, "2026", "Semester 1"), reviewId);
  await completePublicationReview(reviewId, actorId, {});
  assert.equal(review.status, "approved");
  assert.equal(review.reviewedBy, actorId);
  await assert.rejects(() => completePublicationReview(reviewId, actorId, {}), /already decided/);
});
test("staff, submitters and recorded draft creators cannot approve", async () => {
  await submit();
  await assert.rejects(() => validatePublicationReview(reviewId, { id: actorId, role: "staff" }, "teaching", targetId, "2026", "Semester 1"), /administrator/);
  await assert.rejects(() => validatePublicationReview(reviewId, { id: authorId, role: "admin" }, "teaching", targetId, "2026", "Semester 1"), /Self-approval/);
  review.submittedBy = id();
  await assert.rejects(() => validatePublicationReview(reviewId, { id: authorId, role: "admin" }, "teaching", targetId, "2026", "Semester 1"), /Self-approval/);
});
test("assessment editors are preparers and cannot approve another account's submission", async () => {
  rows[0].preparedBy = [actorId];
  await submit("assessment");
  await assert.rejects(() => validatePublicationReview(reviewId, { id: actorId, role: "admin" }, "assessment", targetId, "2026", "Semester 1"), /Self-approval/);
});
test("changed allocations and wrong-term approval IDs are rejected", async () => {
  await submit();
  rows[0].startTime = "09:30";
  await assert.rejects(() => validatePublicationReview(reviewId, { id: actorId, role: "admin" }, "teaching", targetId, "2026", "Semester 1"), /changed after submission/);
  await assert.rejects(() => validatePublicationReview(reviewId, { id: actorId, role: "admin" }, "teaching", targetId, "2027", "Semester 1"), /matching pending/);
});
test("assessment publication uses the same independent immutable review contract", async () => {
  await submit("assessment");
  assert.equal(await validatePublicationReview(reviewId, { id: actorId, role: "admin" }, "assessment", targetId, "2026", "Semester 1"), reviewId);
  rows[0].status = "published";
  await assert.rejects(() => publicationSnapshot("assessment", targetId, "2026", "Semester 1"), /complete draft/);
});
test("approved calendar is required for publication and exact term identity is retained", async () => {
  assert.equal((await requireApprovedTerm("2026", "Semester 1")).status, "approved");
  term = null;
  await assert.rejects(() => requireApprovedTerm("2026", "Semester 1"), /approve this term/);
});
test("dated teaching excludes approved out-of-term recurrence but preserves unknown legacy calendars", async () => {
  const teaching = [{ academicYear: "2026", semester: "Semester 1" }];
  assert.equal((await teachingOnDate(teaching, "2026-09-01")).length, 1);
  assert.equal((await teachingOnDate(teaching, "2026-10-20")).length, 1);
  assert.equal((await teachingOnDate(teaching, "2026-10-21")).length, 0);
  term = null;
  assert.equal((await teachingOnDate(teaching, "2026-10-21")).length, 1);
});
