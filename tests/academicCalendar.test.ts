import assert from "node:assert/strict";
import test from "node:test";
import {
  dateRangesOverlap,
  isAcademicDate,
  teachingWindowsOverlap,
  termContainsAssessmentDate,
  termContainsTeachingDate,
  termContainsTeachingWeekday,
  validateAcademicTerm,
  type AcademicTermInput,
} from "../lib/academicCalendar.ts";

function term(): AcademicTermInput {
  return {
    academicYear: "2026/2027", semester: "Semester 1", status: "draft",
    teachingStartDate: "2026-10-26", teachingEndDate: "2027-02-05",
    assessmentStartDate: "2027-02-08", assessmentEndDate: "2027-02-19",
  };
}

test("strict Lusaka civil dates reject normalization, timestamps and impossible days", () => {
  for (const valid of ["0001-01-01", "0099-12-31", "2000-02-29", "2024-02-29", "2026-10-26", "9999-12-31"]) {
    assert.equal(isAcademicDate(valid), true, valid);
  }
  for (const invalid of ["0000-01-01", "1900-02-29", "2025-02-29", "2100-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-1-01", "2026-10-26T00:00:00+02:00", " 2026-10-26", "", null, 20261026]) {
    assert.equal(isAcademicDate(invalid), false, String(invalid));
  }
});

test("term validation preserves existing year and semester strings without inventing dates", () => {
  assert.equal(validateAcademicTerm(term()), null);
  for (const semester of ["Semester 1", "Semester 2", "Summer", "Custom semester"]) {
    assert.equal(validateAcademicTerm({ ...term(), semester }), null);
  }
  for (const status of ["draft", "approved", "archived"]) assert.equal(validateAcademicTerm({ ...term(), status }), null);
  for (const patch of [{ teachingStartDate: "" }, { academicYear: " " }, { semester: "" }, { status: "published" }, { teachingEndDate: "2026-02-30" }, { injected: "value" }]) {
    assert.ok(validateAcademicTerm({ ...term(), ...patch }));
  }
  assert.ok(validateAcademicTerm(null));
  assert.ok(validateAcademicTerm([]));
  assert.ok(validateAcademicTerm({}));
});

test("both windows must be ordered; inclusive single dates and cross-year windows are valid", () => {
  assert.ok(validateAcademicTerm({ ...term(), teachingEndDate: "2026-10-25" }));
  assert.ok(validateAcademicTerm({ ...term(), assessmentEndDate: "2027-02-07" }));
  assert.equal(validateAcademicTerm({ ...term(), teachingEndDate: "2026-10-26", assessmentEndDate: "2027-02-08" }), null);
  // Continuous assessment can legitimately occur within teaching, so no invented gap is required.
  assert.equal(validateAcademicTerm({ ...term(), assessmentStartDate: "2026-10-26" }), null);
});

test("partial updates validate supplied fields but a merged term must be revalidated", () => {
  assert.equal(validateAcademicTerm({ status: "approved" }, true), null);
  assert.equal(validateAcademicTerm({ teachingEndDate: "2026-10-25" }, true), null);
  assert.ok(validateAcademicTerm({ ...term(), teachingEndDate: "2026-10-25" }));
  assert.ok(validateAcademicTerm({ teachingEndDate: "2026-02-30" }, true));
  assert.ok(validateAcademicTerm({ __v: 10 }, true));
  assert.ok(validateAcademicTerm({ academicYear: undefined }, true));
  assert.ok(validateAcademicTerm({ status: undefined }, true));
});

test("overlap is inclusive and applies across all years and semesters", () => {
  const first = term();
  for (const second of [
    { ...term(), semester: "Semester 2", teachingStartDate: "2027-02-05", teachingEndDate: "2027-03-01" },
    { ...term(), academicYear: "Different label" },
    { ...term(), teachingStartDate: "2026-11-01", teachingEndDate: "2026-11-02" },
    { ...term(), teachingStartDate: "2026-01-01", teachingEndDate: "2027-12-31" },
  ]) {
    assert.equal(teachingWindowsOverlap(first, second), true);
    assert.equal(teachingWindowsOverlap(second, first), true);
  }
  assert.equal(teachingWindowsOverlap(first, { ...term(), teachingStartDate: "2027-02-06", teachingEndDate: "2027-03-01" }), false);
  assert.equal(dateRangesOverlap("2026-02-30", "2026-03-04", "2026-03-01", "2026-03-02"), false);
  assert.equal(dateRangesOverlap("2026-03-04", "2026-03-01", "2026-03-01", "2026-03-02"), false);
});

test("teaching containment respects both inclusive boundaries and rejects assessment-only dates", () => {
  assert.equal(termContainsTeachingDate(term(), "2026-10-26"), true);
  assert.equal(termContainsTeachingDate(term(), "2027-02-05"), true);
  assert.equal(termContainsTeachingDate(term(), "2026-10-25"), false);
  assert.equal(termContainsTeachingDate(term(), "2027-02-06"), false);
  assert.equal(termContainsTeachingDate(term(), "2027-02-08"), false);
  assert.equal(termContainsTeachingDate(term(), "2026-10-26T23:00:00Z"), false);
});

test("assessment containment uses its own inclusive window", () => {
  assert.equal(termContainsAssessmentDate(term(), "2027-02-08"), true);
  assert.equal(termContainsAssessmentDate(term(), "2027-02-19"), true);
  assert.equal(termContainsAssessmentDate(term(), "2027-02-07"), false);
  assert.equal(termContainsAssessmentDate(term(), "2027-02-20"), false);
});

test("weekday checks use Lusaka civil dates, not the previous UTC date of local midnight", () => {
  assert.equal(termContainsTeachingWeekday(term(), "Monday", "2026-10-26"), true);
  assert.equal(termContainsTeachingWeekday(term(), "Sunday", "2026-10-26"), false);
  assert.equal(termContainsTeachingWeekday(term(), "Monday", "2026-10-19"), false);
  assert.equal(termContainsTeachingWeekday(term(), "Friday", "2027-02-05"), true);
  assert.equal(termContainsTeachingWeekday(term(), "Friday", "2027-02-12"), false);
  assert.equal(termContainsTeachingWeekday(term(), "Funday"), false);
});

test("weekday occurrence handles short terms, weekends, year boundaries and leap days", () => {
  const mondayOnly = { teachingStartDate: "2026-10-26", teachingEndDate: "2026-10-26" };
  assert.equal(termContainsTeachingWeekday(mondayOnly, "Monday"), true);
  assert.equal(termContainsTeachingWeekday(mondayOnly, "Tuesday"), false);
  assert.equal(termContainsTeachingWeekday({ teachingStartDate: "2026-10-31", teachingEndDate: "2026-11-01" }, "Sunday"), true);
  assert.equal(termContainsTeachingWeekday({ teachingStartDate: "2026-12-31", teachingEndDate: "2027-01-01" }, "Friday"), true);
  assert.equal(termContainsTeachingWeekday({ teachingStartDate: "2024-02-29", teachingEndDate: "2024-02-29" }, "Thursday"), true);
  assert.equal(termContainsTeachingWeekday({ teachingStartDate: "2025-02-29", teachingEndDate: "2025-03-01" }, "Saturday"), false);
  assert.equal(termContainsTeachingWeekday({ teachingStartDate: "2026-10-27", teachingEndDate: "2026-10-26" }, "Tuesday"), false);
});
