export const ASSESSMENT_TYPES = ["exam", "test", "quiz"] as const;
export const ASSESSMENT_STATUSES = ["draft", "published", "cancelled"] as const;
export const CAMPUS_TIME_ZONE = "Africa/Lusaka";

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export type AssessmentInput = {
  academicYear: string;
  semester: string;
  department: string;
  course: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  title: string;
  assessmentType: AssessmentType;
  studentIds?: string[];
  invigilatorIds: string[];
};

export type AssessmentSlot = {
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
  studentIds: string[];
  invigilatorIds: string[];
};

export type AssessmentConflict = {
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
  studentIds?: string[];
  invigilatorIds?: string[];
};

const ASSESSMENT_KEYS = new Set([
  "academicYear", "semester", "department", "course", "date", "startTime", "endTime",
  "room", "title", "assessmentType", "studentIds", "invigilatorIds",
]);
const ID_PATTERN = /^[a-f\d]{24}$/i;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidObjectIdString(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function validateDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validateTimeRange(date: unknown, startTime: unknown, endTime: unknown) {
  return validateDateOnly(date) &&
    typeof startTime === "string" && TIME_PATTERN.test(startTime) &&
    typeof endTime === "string" && TIME_PATTERN.test(endTime) &&
    timeToMinutes(startTime) < timeToMinutes(endTime);
}

export function timeToMinutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function validateAssessmentCapacity(capacity: unknown, studentCount: number) {
  return Number.isSafeInteger(capacity) && (capacity as number) > 0 &&
    Number.isSafeInteger(studentCount) && studentCount > 0 && (capacity as number) >= studentCount;
}

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}

export function validateAssessmentPayload(value: unknown, options: { allowPartial?: boolean } = {}): string | null {
  if (!isRecord(value)) return "A valid assessment object is required.";
  if (Object.keys(value).some((key) => !ASSESSMENT_KEYS.has(key))) return "The request contains unsupported assessment fields.";

  const partial = options.allowPartial === true;
  const requiredStrings = ["academicYear", "semester", "date", "startTime", "endTime", "title"] as const;
  for (const key of requiredStrings) {
    if (value[key] === undefined && partial) continue;
    if (typeof value[key] !== "string" || !value[key].trim()) return `${key} must be a non-empty string.`;
  }
  if (typeof value.academicYear === "string" && (value.academicYear.trim().length > 30 || value.academicYear.trim().length < 1)) {
    return "academicYear must be between 1 and 30 characters.";
  }
  if (typeof value.semester === "string" && value.semester.trim().length > 50) return "semester must be at most 50 characters.";
  if (typeof value.title === "string" && value.title.trim().length > 120) return "title must be at most 120 characters.";

  for (const key of ["department", "course", "room"] as const) {
    if (value[key] === undefined && partial) continue;
    if (!isValidObjectIdString(value[key])) return `${key} must be a valid id.`;
  }
  if (value.assessmentType !== undefined && !ASSESSMENT_TYPES.includes(value.assessmentType as AssessmentType)) {
    return "assessmentType must be exam, test, or quiz.";
  }
  if (!partial && value.assessmentType === undefined) return "assessmentType must be exam, test, or quiz.";

  if ((!partial && (value.date !== undefined || value.startTime !== undefined || value.endTime !== undefined)) ||
      (value.date !== undefined && value.startTime !== undefined && value.endTime !== undefined)) {
    if (!validateTimeRange(value.date, value.startTime, value.endTime)) {
      return "date must be a real YYYY-MM-DD date and startTime/endTime must be valid same-day HH:mm times with start before end.";
    }
  }

  if (value.studentIds !== undefined) {
    const error = validateIdList(value.studentIds, "studentIds", 10000, true);
    if (error) return error;
  }
  if (value.invigilatorIds !== undefined) {
    const error = validateIdList(value.invigilatorIds, "invigilatorIds", 20, false);
    if (error) return error;
  } else if (!partial) {
    return "At least one invigilator is required.";
  }
  return null;
}

function validateIdList(value: unknown, field: string, maximum: number, allowEmpty: boolean): string | null {
  if (!Array.isArray(value) || value.length > maximum || (!allowEmpty && value.length === 0)) {
    return `${field} must be an array${allowEmpty ? "" : " containing at least one id"} of at most ${maximum} ids.`;
  }
  if (value.some((id) => !isValidObjectIdString(id))) return `${field} must contain only valid ids.`;
  if (new Set(value.map((id: string) => id.toLowerCase())).size !== value.length) return `${field} must not contain duplicate ids.`;
  return null;
}

export function hasAssessmentConflict(candidate: AssessmentSlot, others: AssessmentConflict[]) {
  return others.some((other) =>
    other.date === candidate.date &&
    rangesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime) &&
    (
      candidate.roomId === other.roomId ||
      candidate.studentIds.some((id) => other.studentIds?.includes(id)) ||
      candidate.invigilatorIds.some((id) => other.invigilatorIds?.includes(id))
    )
  );
}

export function getCampusWeekday(date: string) {
  if (!validateDateOnly(date)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, weekday: "long" })
    .format(new Date(`${date}T12:00:00+02:00`));
}

export function getCampusDateTime(date: string, time: string) {
  if (!validateDateOnly(date) || !TIME_PATTERN.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 2, minute));
}
