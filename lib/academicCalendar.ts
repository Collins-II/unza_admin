export const ACADEMIC_TERM_STATUSES = ["draft", "approved", "archived"] as const;
export type AcademicTermStatus = (typeof ACADEMIC_TERM_STATUSES)[number];

export type AcademicTermInput = {
  academicYear: string;
  semester: string;
  teachingStartDate: string;
  teachingEndDate: string;
  assessmentStartDate: string;
  assessmentEndDate: string;
  status: AcademicTermStatus;
};

export type AcademicTermRecord = AcademicTermInput & {
  _id: string;
  __v: number;
};

export type ApprovedAcademicTerm = AcademicTermRecord & { status: "approved" };

export const ACADEMIC_TERM_DATE_FIELDS = [
  "teachingStartDate", "teachingEndDate", "assessmentStartDate", "assessmentEndDate",
] as const;

export function isAcademicDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateAcademicTerm(value: unknown, allowPartial = false): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "A valid academic term object is required.";
  const input = value as Record<string, unknown>;
  const fields = ["academicYear", "semester", ...ACADEMIC_TERM_DATE_FIELDS, "status"];
  if (Object.keys(input).some((key) => !fields.includes(key))) return "The term contains unsupported fields.";
  for (const [field, limit] of [["academicYear", 30], ["semester", 50]] as const) {
    if (allowPartial && !(field in input)) continue;
    if (typeof input[field] !== "string" || !input[field].trim() || input[field].trim().length > limit) {
      return `${field} must be between 1 and ${limit} characters. Use the exact timetable year/semester label.`;
    }
  }
  for (const field of ACADEMIC_TERM_DATE_FIELDS) {
    if (allowPartial && !(field in input)) continue;
    if (!isAcademicDate(input[field])) return `${field} must be a real YYYY-MM-DD date in Africa/Lusaka.`;
  }
  if ((!allowPartial || "status" in input) &&
      !ACADEMIC_TERM_STATUSES.includes(input.status as AcademicTermStatus)) {
    return "status must be draft, approved, or archived.";
  }
  if (typeof input.teachingStartDate === "string" && typeof input.teachingEndDate === "string" &&
      input.teachingStartDate > input.teachingEndDate) return "Teaching start must not follow teaching end.";
  if (typeof input.assessmentStartDate === "string" && typeof input.assessmentEndDate === "string" &&
      input.assessmentStartDate > input.assessmentEndDate) return "Assessment start must not follow assessment end.";
  return null;
}

/** Date-only values denote Lusaka civil dates, not UTC instants; endpoints are inclusive. */
export function dateRangesOverlap(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return [start, end, otherStart, otherEnd].every(isAcademicDate) &&
    start <= end && otherStart <= otherEnd && start <= otherEnd && otherStart <= end;
}

type TeachingWindow = Pick<AcademicTermInput, "teachingStartDate" | "teachingEndDate">;
type AssessmentWindow = Pick<AcademicTermInput, "assessmentStartDate" | "assessmentEndDate">;

/** Approval rejects ALL overlapping teaching windows, even different semesters or years. */
export function teachingWindowsOverlap(first: TeachingWindow, second: TeachingWindow): boolean {
  return dateRangesOverlap(first.teachingStartDate, first.teachingEndDate, second.teachingStartDate, second.teachingEndDate);
}

export function termContainsTeachingDate(term: TeachingWindow, date: string): boolean {
  return dateRangesOverlap(term.teachingStartDate, term.teachingEndDate, date, date);
}

export function termContainsAssessmentDate(term: AssessmentWindow, date: string): boolean {
  return dateRangesOverlap(term.assessmentStartDate, term.assessmentEndDate, date, date);
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function civilDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * With a date, checks that civil date and weekday lie in the teaching window.
 * Without a date, checks that at least one occurrence of the weekday exists.
 * These pure helpers do not assert approval; call requireApprovedTerm first.
 * Missing calendars must block new writes, never hide legacy published teaching.
 */
export function termContainsTeachingWeekday(term: TeachingWindow, weekday: string, date?: string): boolean {
  const day = weekdays.indexOf(weekday);
  if (day < 0 || !isAcademicDate(term.teachingStartDate) || !isAcademicDate(term.teachingEndDate) ||
      term.teachingStartDate > term.teachingEndDate) return false;
  if (date !== undefined) return termContainsTeachingDate(term, date) && civilDate(date).getUTCDay() === day;
  const start = civilDate(term.teachingStartDate);
  const offset = (day - start.getUTCDay() + 7) % 7;
  return start.getTime() + offset * 86_400_000 <= civilDate(term.teachingEndDate).getTime();
}
