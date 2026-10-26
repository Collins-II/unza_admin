import mongoose, { type ClientSession } from "mongoose";
import { auditedMutation } from "@/lib/audit";
import { connectToDatabase } from "@/lib/database";
import AcademicTerm from "@/lib/database/models/AcademicTerm";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import TimetableLock from "@/lib/database/models/TimetableLock";
import User from "@/lib/database/models/User";
import {
  ACADEMIC_TERM_DATE_FIELDS,
  termContainsAssessmentDate,
  termContainsTeachingWeekday,
  validateAcademicTerm,
  type AcademicTermInput,
  type AcademicTermRecord,
  type ApprovedAcademicTerm,
} from "@/lib/academicCalendar";
import {
  acquireTimetableConfigurationLock,
  releaseTimetableLock,
  renewTimetableLock,
} from "@/lib/timetableLock";

export class AcademicCalendarError extends Error {
  constructor(message: string, readonly status = 409, readonly code = "ACADEMIC_CALENDAR_CONFLICT") {
    super(message);
    this.name = "AcademicCalendarError";
  }
}

function assertInput(value: unknown, partial = false): asserts value is AcademicTermInput {
  const error = validateAcademicTerm(value, partial);
  if (error) throw new AcademicCalendarError(error, 400, "INVALID_ACADEMIC_TERM");
}

function normalized(input: AcademicTermInput): AcademicTermInput {
  return {
    academicYear: input.academicYear.trim(),
    semester: input.semester.trim(),
    teachingStartDate: input.teachingStartDate,
    teachingEndDate: input.teachingEndDate,
    assessmentStartDate: input.assessmentStartDate,
    assessmentEndDate: input.assessmentEndDate,
    status: input.status,
  };
}

function record(input: AcademicTermInput & { _id: mongoose.Types.ObjectId; __v: number }): AcademicTermRecord {
  return { ...normalized(input), _id: String(input._id), __v: input.__v };
}

async function assertAdministrator(actor: string, session: ClientSession) {
  if (!/^[a-f\d]{24}$/i.test(actor)) throw new AcademicCalendarError("Administrator access is required.", 403, "FORBIDDEN");
  const user = await User.findById(actor).select("role status").session(session).lean();
  if (!user || user.role !== "admin" || user.status !== "active") {
    throw new AcademicCalendarError("An active system administrator must manage approved term dates.", 403, "FORBIDDEN");
  }
}

async function withConfigurationLock<T>(work: (lock: { key: string; token: string }) => Promise<T>): Promise<T> {
  await connectToDatabase();
  await AcademicTerm.init();
  await TimetableLock.init();
  const lock = await acquireTimetableConfigurationLock();
  if (!lock) throw new AcademicCalendarError("Another timetable configuration change is in progress. Retry shortly.");
  try {
    await renewTimetableLock(lock);
    return await work(lock);
  } finally {
    await releaseTimetableLock(lock);
  }
}

async function assertNoDependencies(input: AcademicTermInput, session: ClientSession) {
  const filter = { academicYear: input.academicYear, semester: input.semester };
  const teaching = await TimetableAllocation.exists({ ...filter, status: "published" }).session(session);
  const assessment = await AssessmentAllocation.exists({ ...filter, status: { $ne: "cancelled" } }).session(session);
  if (teaching || assessment) {
    throw new AcademicCalendarError(
      "Resolve this term's published teaching and all non-cancelled assessments before editing dates, withdrawing approval, or archiving.",
      409, "TERM_HAS_DEPENDENCIES",
    );
  }
}

async function assertApproval(input: AcademicTermInput, id: mongoose.Types.ObjectId, session: ClientSession) {
  assertInput(input);
  // One campus calendar: even distinct semesters/years cannot have simultaneous approved teaching.
  const overlap = await AcademicTerm.exists({
    _id: { $ne: id },
    status: "approved",
    teachingStartDate: { $lte: input.teachingEndDate },
    teachingEndDate: { $gte: input.teachingStartDate },
  }).session(session);
  if (overlap) throw new AcademicCalendarError("Approved teaching windows must not overlap, including across different years or semesters.", 409, "TERM_OVERLAP");
  const filter = { academicYear: input.academicYear, semester: input.semester };
  const assessments = await AssessmentAllocation.find({ ...filter, status: { $ne: "cancelled" } })
    .select("date").session(session).lean();
  if (assessments.some((assessment) => !termContainsAssessmentDate(input, assessment.date))) {
    throw new AcademicCalendarError("Resolve assessments outside the proposed assessment window before approval.", 409, "ASSESSMENT_OUTSIDE_TERM");
  }
  const teaching = await TimetableAllocation.find({ ...filter, status: "published" })
    .select("dayOfWeek").session(session).lean();
  if (teaching.some((allocation) => !termContainsTeachingWeekday(input, allocation.dayOfWeek))) {
    throw new AcademicCalendarError("The teaching window must contain the weekdays of existing published teaching.", 409, "TEACHING_OUTSIDE_TERM");
  }
}

export async function createAcademicTerm(actor: string, value: unknown): Promise<AcademicTermRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) assertInput(value);
  const candidate = { status: "draft", ...(value as Record<string, unknown>) };
  assertInput(candidate);
  const input = normalized(candidate);
  if (input.status !== "draft") throw new AcademicCalendarError("Create a draft first, then explicitly approve its dates.", 400, "INVALID_STATUS_TRANSITION");
  return withConfigurationLock(async (lock) => {
    const id = new mongoose.Types.ObjectId();
    return auditedMutation(actor, "academic-calendar.create", String(id), {
      after: JSON.stringify(input),
    }, async (session) => {
      await assertAdministrator(actor, session);
      const duplicate = await AcademicTerm.exists({ academicYear: input.academicYear, semester: input.semester }).session(session);
      if (duplicate) throw new AcademicCalendarError("A calendar already exists for this exact academic year and semester.", 409, "DUPLICATE_TERM");
      await renewTimetableLock(lock);
      const [created] = await AcademicTerm.create([{ _id: id, ...input }], { session });
      return record(created.toObject());
    });
  });
}

export async function updateAcademicTerm(
  actor: string, id: string, expectedVersion: number, patch: unknown,
): Promise<AcademicTermRecord> {
  if (!/^[a-f\d]{24}$/i.test(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new AcademicCalendarError("A valid id and non-negative expectedVersion are required.", 400, "INVALID_ACADEMIC_TERM");
  }
  assertInput(patch, true);
  return withConfigurationLock(async (lock) => {
    const details: Record<string, string> = { expectedVersion: String(expectedVersion) };
    return auditedMutation(actor, "academic-calendar.update", id, details, async (session) => {
      await assertAdministrator(actor, session);
      const current = await AcademicTerm.findById(id).session(session).lean();
      if (!current) throw new AcademicCalendarError("Academic term was not found.", 404, "TERM_NOT_FOUND");
      if (current.__v !== expectedVersion) {
        throw new AcademicCalendarError("This term changed since it was loaded. Reload it and retry.", 409, "STALE_TERM");
      }
      if (current.status === "archived") {
        throw new AcademicCalendarError("Archived terms are read-only.", 409, "TERM_ARCHIVED");
      }
      const input = normalized({ ...normalized(current), ...patch });
      assertInput(input);
      if (input.academicYear !== current.academicYear || input.semester !== current.semester) {
        throw new AcademicCalendarError("Academic year and semester labels cannot change. Create a separate term instead.", 409, "TERM_IDENTITY_IMMUTABLE");
      }
      if (ACADEMIC_TERM_DATE_FIELDS.some((field) => input[field] !== current[field]) ||
          input.status === "archived" || (current.status === "approved" && input.status !== "approved")) {
        await assertNoDependencies(current, session);
      }
      if (input.status === "approved") await assertApproval(input, current._id, session);
      await renewTimetableLock(lock);
      const updated = await AcademicTerm.findOneAndUpdate(
        { _id: id, __v: expectedVersion },
        { $set: input, $inc: { __v: 1 } },
        { new: true, runValidators: true, session },
      ).lean();
      if (!updated) throw new AcademicCalendarError("This term changed while saving. Reload it and retry.", 409, "STALE_TERM");
      details.before = JSON.stringify(record(current));
      details.after = JSON.stringify(record(updated));
      details.transition = `${current.status}->${input.status}`;
      return record(updated);
    });
  });
}

/**
 * Publication callers must hold the global configuration/mutation lock through their write.
 * Missing/unapproved calendars block new writes; do not use this to filter legacy read results.
 */
export async function requireApprovedTerm(academicYear: string, semester: string): Promise<ApprovedAcademicTerm> {
  if (typeof academicYear !== "string" || typeof semester !== "string" || !academicYear.trim() ||
      !semester.trim() || academicYear.trim().length > 30 || semester.trim().length > 80) {
    throw new AcademicCalendarError("Valid academic year and semester labels are required.", 400, "INVALID_ACADEMIC_TERM");
  }
  await connectToDatabase();
  const term = await AcademicTerm.findOne({
    academicYear: academicYear.trim(), semester: semester.trim(), status: "approved",
  }).lean();
  if (!term) {
    throw new AcademicCalendarError("An administrator must approve this term's calendar before scheduling or publication.", 409, "TERM_NOT_APPROVED");
  }
  const input = normalized(term);
  const error = validateAcademicTerm(input);
  if (error) throw new AcademicCalendarError(`The approved term calendar is invalid: ${error}`, 409, "INVALID_APPROVED_TERM");
  return { ...record(term), status: "approved" };
}
