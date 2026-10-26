import assert from "node:assert/strict";
import test from "node:test";

import {
  getCampusDateTime,
  getCampusWeekday,
  hasAssessmentConflict,
  rangesOverlap,
  validateAssessmentCapacity,
  validateAssessmentPayload,
  validateDateOnly,
  validateTimeRange,
} from "../lib/assessmentValidation.ts";

const ids = {
  department: "0123456789abcdef01234567",
  course: "1123456789abcdef01234567",
  room: "2123456789abcdef01234567",
  student: "3123456789abcdef01234567",
  invigilator: "4123456789abcdef01234567",
};

function validPayload() {
  return {
    academicYear: "2026",
    semester: "Semester 2",
    department: ids.department,
    course: ids.course,
    date: "2026-10-26",
    startTime: "09:00",
    endTime: "10:00",
    room: ids.room,
    title: "Mid-semester assessment",
    assessmentType: "test",
    invigilatorIds: [ids.invigilator],
  };
}

test("accepts strict real calendar dates and Lusaka date-time semantics", () => {
  assert.equal(validateDateOnly("2024-02-29"), true);
  assert.equal(validateDateOnly("2025-02-29"), false);
  assert.equal(validateDateOnly("2026-04-31"), false);
  assert.equal(validateDateOnly("2026-1-01"), false);
  assert.equal(getCampusWeekday("2026-10-26"), "Monday");
  assert.equal(getCampusDateTime("2026-10-26", "09:00")?.toISOString(), "2026-10-26T07:00:00.000Z");
});

test("rejects malformed assessment dates, times, and ordering", () => {
  assert.equal(validateTimeRange("2026-02-30", "09:00", "10:00"), false);
  assert.equal(validateTimeRange("2026-10-26", "24:00", "25:00"), false);
  assert.equal(validateTimeRange("2026-10-26", "09:00", "09:00"), false);
  assert.equal(validateTimeRange("2026-10-26", "10:00", "09:00"), false);
  assert.equal(validateTimeRange("2026-10-26", "09:00", "10:00"), true);
  assert.equal(validateAssessmentPayload({ ...validPayload(), date: "2026-02-30" })?.includes("YYYY-MM-DD"), true);
});

test("requires unique valid identifiers and rejects injected fields", () => {
  assert.equal(validateAssessmentPayload(validPayload()), null);
  assert.match(validateAssessmentPayload({ ...validPayload(), invigilatorIds: [] }) || "", /at least one id/);
  assert.match(validateAssessmentPayload({ ...validPayload(), studentIds: [ids.student, ids.student] }) || "", /duplicate/);
  assert.match(validateAssessmentPayload({ ...validPayload(), invigilatorIds: [ids.invigilator, ids.invigilator.toUpperCase()] }) || "", /duplicate/);
  assert.match(validateAssessmentPayload({ ...validPayload(), room: { $ne: null } }) || "", /valid id/);
  assert.match(validateAssessmentPayload({ ...validPayload(), $where: "true" }) || "", /unsupported/);
});

test("requires a positive integral room capacity sufficient for the roster", () => {
  assert.equal(validateAssessmentCapacity(40, 40), true);
  assert.equal(validateAssessmentCapacity(39, 40), false);
  assert.equal(validateAssessmentCapacity(0, 1), false);
  assert.equal(validateAssessmentCapacity(10.5, 1), false);
  assert.equal(validateAssessmentCapacity(10, 0), false);
});

test("uses half-open ranges so adjacent assessments do not overlap", () => {
  assert.equal(rangesOverlap("09:00", "10:00", "10:00", "11:00"), false);
  assert.equal(rangesOverlap("09:00", "10:00", "09:59", "11:00"), true);
});

test("detects actual same-date room, student, and invigilator conflicts", () => {
  const candidate = {
    date: "2026-10-26",
    startTime: "09:00",
    endTime: "10:00",
    roomId: ids.room,
    studentIds: [ids.student],
    invigilatorIds: [ids.invigilator],
  };
  const conflict = (overrides: Record<string, unknown> = {}) => ({
    date: "2026-10-26",
    startTime: "09:30",
    endTime: "10:30",
    roomId: "5123456789abcdef01234567",
    studentIds: [],
    invigilatorIds: [],
    ...overrides,
  });
  assert.equal(hasAssessmentConflict(candidate, [conflict({ roomId: ids.room })]), true);
  assert.equal(hasAssessmentConflict(candidate, [conflict({ studentIds: [ids.student] })]), true);
  assert.equal(hasAssessmentConflict(candidate, [conflict({ invigilatorIds: [ids.invigilator] })]), true);
  assert.equal(hasAssessmentConflict(candidate, [conflict({ startTime: "10:00", endTime: "11:00", roomId: ids.room })]), false);
  assert.equal(hasAssessmentConflict(candidate, [conflict({ date: "2026-10-27", roomId: ids.room })]), false);
  assert.equal(hasAssessmentConflict(candidate, [conflict()]), false);
});
