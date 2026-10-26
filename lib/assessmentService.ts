import mongoose from "mongoose";

import { auditedMutation } from "@/lib/audit";
import { connectToDatabase } from "@/lib/database";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import Booking from "@/lib/database/models/Booking";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import User from "@/lib/database/models/User";
import { requireApprovedTerm } from "@/lib/academicCalendarService";
import { termContainsAssessmentDate } from "@/lib/academicCalendar";
import { validatePublicationReview, completePublicationReview } from "@/lib/publicationService";
import { canAccessDepartment } from "@/lib/departmentAccess";
import { teachingOnDate } from "@/lib/termSchedule";
import { getCampusTimeSlot } from "@/lib/bookingValidation";
import {
  getCampusDateTime,
  getCampusWeekday,
  hasAssessmentConflict,
  isRecord,
  rangesOverlap,
  validateAssessmentPayload,
  validateAssessmentCapacity,
  validateDateOnly,
  type AssessmentInput,
  type AssessmentSlot,
} from "@/lib/assessmentValidation";
import {
  acquireTimetableMutationLock,
  releaseTimetableMutationLock,
  renewTimetableMutationLock,
  type TimetableMutationLock,
} from "@/lib/timetableLock";

export class AssessmentServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AssessmentServiceError";
  }
}

type AssessmentPatch = Partial<AssessmentInput>;

async function assertActorDepartment(actor: string, department: string) {
  const user = await User.findById(actor).select("role status departmentIds").lean();
  if (!user || user.status !== "active" || !canAccessDepartment({
    role: user.role, departmentIds: (user.departmentIds || []).map(String),
  }, department)) throw new AssessmentServiceError("This department is outside your active access.", 403);
  return { id: actor, role: user.role };
}
type CurrentAssessment = {
  _id: mongoose.Types.ObjectId;
  academicYear: string;
  semester: string;
  department: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  date: string;
  startTime: string;
  endTime: string;
  room: mongoose.Types.ObjectId;
  title: string;
  assessmentType: "exam" | "test" | "quiz";
  status: "draft" | "published" | "cancelled";
  studentIds: mongoose.Types.ObjectId[];
  invigilatorIds: mongoose.Types.ObjectId[];
  __v: number;
};

function normalized(input: AssessmentInput): AssessmentInput {
  return {
    ...input,
    academicYear: input.academicYear.trim(),
    semester: input.semester.trim(),
    date: input.date.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    title: input.title.trim(),
    department: input.department.toLowerCase(),
    course: input.course.toLowerCase(),
    room: input.room.toLowerCase(),
    studentIds: input.studentIds?.map((id) => id.toLowerCase()),
    invigilatorIds: input.invigilatorIds.map((id) => id.toLowerCase()),
  };
}

function assertCompleteInput(value: unknown): asserts value is AssessmentInput {
  const error = validateAssessmentPayload(value);
  if (error) throw new AssessmentServiceError(error, 400);
}

function assertValidPayload(value: unknown, partial = false): asserts value is AssessmentPatch {
  const error = validateAssessmentPayload(value, { allowPartial: partial });
  if (error) throw new AssessmentServiceError(error, 400);
}

function nextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function assessmentSlot(input: AssessmentInput, studentIds: string[], invigilatorIds: string[]): AssessmentSlot {
  return {
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    roomId: input.room,
    studentIds,
    invigilatorIds,
  };
}

async function validateReferencesAndConflicts(
  input: AssessmentInput,
  excludedId?: mongoose.Types.ObjectId
) {
  const [department, course, room] = await Promise.all([
    Department.findById(input.department).lean(),
    Course.findById(input.course).lean(),
    Room.findById(input.room).lean(),
  ]);
  if (!department || !course || !room) throw new AssessmentServiceError("Department, course, or room was not found.", 404);
  if (department.active === false) throw new AssessmentServiceError("Inactive departments cannot receive assessments.", 409);
  if (course.active !== true || course.catalogueOnly) {
    throw new AssessmentServiceError("Only active configured courses can receive assessments.", 409);
  }
  if (String(course.department) !== String(department._id)) {
    throw new AssessmentServiceError("The selected course does not belong to this department.", 409);
  }
  if (course.semester && course.semester.trim() !== input.semester) {
    throw new AssessmentServiceError("The selected course does not belong to this semester.", 409);
  }
  if (room.isAvailable !== true || !Number.isSafeInteger(room.capacity) || (room.capacity || 0) <= 0) {
    throw new AssessmentServiceError("Select an available room with a positive whole-number capacity.", 409);
  }
  if (!["lecture_room", "laboratory", "seminar_room"].includes(room.spaceType || "")) {
    throw new AssessmentServiceError("Assessments require an explicitly classified teaching space.", 409);
  }

  const roster = await User.find({
    role: "student",
    status: "active",
    enrolledCourses: course._id,
  }).select("_id").lean();
  if (!roster.length) throw new AssessmentServiceError("No active students are enrolled in this course.", 409);
  const rosterIds = roster.map((student) => String(student._id));
  const selectedStudents = input.studentIds === undefined ? rosterIds : input.studentIds;
  if (!selectedStudents.length) throw new AssessmentServiceError("An assessment must include at least one enrolled student.", 409);
  const rosterSet = new Set(rosterIds);
  if (selectedStudents.some((id) => !rosterSet.has(id))) {
    throw new AssessmentServiceError("Every selected student must be an active member of the course roster.", 409);
  }
  if (!validateAssessmentCapacity(room.capacity, selectedStudents.length)) {
    throw new AssessmentServiceError(`Room capacity (${room.capacity}) is below the selected student count (${selectedStudents.length}).`, 409);
  }

  const invigilators = await User.find({
    _id: { $in: input.invigilatorIds },
    role: { $in: ["staff", "admin"] },
    status: "active",
  }).select("_id name").lean();
  if (invigilators.length !== input.invigilatorIds.length) {
    throw new AssessmentServiceError("Every invigilator must be an active staff or administrator account.", 409);
  }

  const candidate = assessmentSlot(input, selectedStudents, input.invigilatorIds);
  const assessments = await AssessmentAllocation.find({
    date: input.date,
    status: { $ne: "cancelled" },
    ...(excludedId ? { _id: { $ne: excludedId } } : {}),
  }).select("date startTime endTime room studentIds invigilatorIds").lean();
  if (hasAssessmentConflict(candidate, assessments.map((assessment) => ({
    date: assessment.date,
    startTime: assessment.startTime,
    endTime: assessment.endTime,
    roomId: String(assessment.room),
    studentIds: (assessment.studentIds || []).map(String),
    invigilatorIds: (assessment.invigilatorIds || []).map(String),
  })))) {
    throw new AssessmentServiceError("This assessment overlaps another non-cancelled assessment for its room, students, or invigilators.", 409);
  }

  const weekday = getCampusWeekday(input.date);
  const campusStart = getCampusDateTime(input.date, input.startTime);
  const campusEnd = getCampusDateTime(input.date, input.endTime);
  if (!weekday || !campusStart || !campusEnd) throw new AssessmentServiceError("The assessment date and time are invalid.", 400);

  const teaching = await TimetableAllocation.find({
    status: "published",
    dayOfWeek: weekday,
    startTime: { $lt: input.endTime },
    endTime: { $gt: input.startTime },
  }).select("academicYear semester room course lecturer startTime endTime streamStudentIds").lean();
  const datedTeaching = await teachingOnDate(teaching, input.date);
  const courseIds = [...new Set(teaching.map((allocation) => String(allocation.course)))];
  const activeStudents = courseIds.length ? await User.find({
    role: "student",
    status: "active",
    enrolledCourses: { $in: courseIds },
  }).select("_id enrolledCourses").lean() : [];
  const rosterByCourse = new Map<string, string[]>();
  for (const student of activeStudents) {
    for (const courseId of student.enrolledCourses || []) {
      const key = String(courseId);
      const list = rosterByCourse.get(key);
      if (list) list.push(String(student._id));
      else rosterByCourse.set(key, [String(student._id)]);
    }
  }
  const selectedSet = new Set(selectedStudents);
  const teachingConflict = datedTeaching.some((allocation) => {
    if (!rangesOverlap(input.startTime, input.endTime, allocation.startTime, allocation.endTime)) return false;
    const teachingStudents: string[] = allocation.streamStudentIds?.length
      ? allocation.streamStudentIds.map((id: unknown) => String(id))
      : rosterByCourse.get(String(allocation.course)) || [];
    const lecturers = String(allocation.lecturer || "").split("/").map((name) => name.trim().toLowerCase()).filter(Boolean);
    const invigilatorTeaching = invigilators.some((person) => lecturers.includes(String(person.name).trim().toLowerCase()));
    return String(allocation.room) === input.room || teachingStudents.some((id) => selectedSet.has(id)) || invigilatorTeaching;
  });
  if (teachingConflict) {
    throw new AssessmentServiceError("This assessment conflicts with a published weekly teaching allocation on that date.", 409);
  }

  const campusNext = getCampusDateTime(nextDate(input.date), "00:00");
  const campusMidnight = getCampusDateTime(input.date, "00:00");
  if (!campusNext || !campusMidnight) throw new AssessmentServiceError("The assessment date is invalid.", 400);
  const bookings = await Booking.find({
    status: "confirmed",
    startTime: { $lt: campusNext },
    endTime: { $gt: campusMidnight },
    $or: [{ room: input.room }, { user: { $in: selectedStudents } }],
  }).select("room user startTime endTime").lean();
  const bookingConflict = bookings.some((booking) => {
    if (String(booking.room) !== input.room && !selectedSet.has(String(booking.user))) return false;
    const slot = getCampusTimeSlot(booking.startTime, booking.endTime);
    if (slot?.dayOfWeek === weekday && slot.startTime && slot.endTime &&
        rangesOverlap(input.startTime, input.endTime, slot.startTime, slot.endTime)) return true;
    return booking.startTime < campusEnd && booking.endTime > campusStart;
  });
  if (bookingConflict) {
    throw new AssessmentServiceError("This assessment conflicts with a confirmed room or student booking on that date.", 409);
  }

  return { studentIds: selectedStudents.map((id) => new mongoose.Types.ObjectId(id)) };
}

function currentAsInput(current: CurrentAssessment): AssessmentInput {
  return {
    academicYear: current.academicYear,
    semester: current.semester,
    department: String(current.department),
    course: String(current.course),
    date: current.date,
    startTime: current.startTime,
    endTime: current.endTime,
    room: String(current.room),
    title: current.title,
    assessmentType: current.assessmentType,
    studentIds: current.studentIds.map(String),
    invigilatorIds: current.invigilatorIds.map(String),
  };
}

export async function createAssessmentAllocation(actor: string, value: unknown) {
  assertCompleteInput(value);
  const input = normalized(value);
  await connectToDatabase();
  let lock: TimetableMutationLock | null = null;
  try {
    lock = await acquireTimetableMutationLock(input.academicYear, input.semester);
    if (!lock) throw new AssessmentServiceError("Another timetable change is in progress. Please retry shortly.", 409);
    await assertActorDepartment(actor, input.department);
    const term = await requireApprovedTerm(input.academicYear, input.semester);
    if (!termContainsAssessmentDate(term, input.date)) throw new AssessmentServiceError("Assessment date is outside the approved assessment window.", 409);
    const { studentIds } = await validateReferencesAndConflicts(input);
    await renewTimetableMutationLock(lock);
    const allocationId = new mongoose.Types.ObjectId();
    const allocation = await auditedMutation(actor, "assessment.create", String(allocationId), {
      academicYear: input.academicYear,
      semester: input.semester,
      date: input.date,
      assessmentType: input.assessmentType,
      studentCount: String(studentIds.length),
    }, async (session) => {
      const [created] = await AssessmentAllocation.create([{
        _id: allocationId,
        ...input,
        studentIds,
        invigilatorIds: input.invigilatorIds.map((id) => new mongoose.Types.ObjectId(id)),
        status: "draft",
        createdBy: actor,
        preparedBy: [actor],
      }], { session });
      return created.toObject();
    });
    return allocation;
  } finally {
    if (lock) await releaseTimetableMutationLock(lock);
  }
}

export async function updateAssessmentAllocation(
  actor: string,
  id: string,
  expectedVersion: number,
  patchValue: unknown,
  status: "draft" | "published" | "cancelled",
  approvalId?: string,
) {
  assertValidPayload(patchValue, true);
  if (status === "published" && Object.keys(patchValue as object).length) {
    throw new AssessmentServiceError("Publication cannot modify a submitted assessment. Save a draft and resubmit changes first.", 400);
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new AssessmentServiceError("expectedVersion must be a non-negative whole number.", 400);
  }
  if (!isRecord(patchValue)) throw new AssessmentServiceError("A valid assessment patch is required.", 400);
  const patch = patchValue as AssessmentPatch;
  await connectToDatabase();
  const initial = await AssessmentAllocation.findById(id).lean() as CurrentAssessment | null;
  if (!initial) throw new AssessmentServiceError("Assessment not found.", 404);
  const termYear = typeof patch.academicYear === "string" ? patch.academicYear.trim() : initial.academicYear;
  const termSemester = typeof patch.semester === "string" ? patch.semester.trim() : initial.semester;
  let lock: TimetableMutationLock | null = null;
  try {
    lock = await acquireTimetableMutationLock(termYear, termSemester);
    if (!lock) throw new AssessmentServiceError("Another timetable change is in progress. Please retry shortly.", 409);
    const current = await AssessmentAllocation.findById(id).lean() as CurrentAssessment | null;
    if (!current) throw new AssessmentServiceError("Assessment not found.", 404);
    const actorUser = await assertActorDepartment(actor, String(current.department));
    if (actorUser.role !== "admin" && current.status === "published") {
      throw new AssessmentServiceError("Only an administrator can change a published assessment.", 403);
    }
    if (current.__v !== expectedVersion) {
      throw new AssessmentServiceError(`This assessment changed since it was loaded. Reload it and retry (current version ${current.__v}).`, 409);
    }
    const merged: AssessmentInput = {
      ...currentAsInput(current),
      ...patch,
      studentIds: patch.studentIds === undefined && patch.course && patch.course.toLowerCase() !== String(current.course).toLowerCase()
        ? undefined
        : patch.studentIds === undefined ? current.studentIds.map(String) : patch.studentIds,
      invigilatorIds: patch.invigilatorIds === undefined ? current.invigilatorIds.map(String) : patch.invigilatorIds,
    };
    const input = normalized(merged);
    await assertActorDepartment(actor, input.department);
    const inputError = validateAssessmentPayload(input);
    if (inputError) throw new AssessmentServiceError(inputError, 400);
    if (status !== "cancelled") {
      const term = await requireApprovedTerm(input.academicYear, input.semester);
      if (!termContainsAssessmentDate(term, input.date)) throw new AssessmentServiceError("Assessment date is outside the approved assessment window.", 409);
    }
    const reviewId = status === "published"
      ? await validatePublicationReview(approvalId, actorUser, "assessment", id, current.academicYear, current.semester) : null;
    const resolved = status === "cancelled" && Object.keys(patch).length === 0
      ? { studentIds: current.studentIds }
      : await validateReferencesAndConflicts(input, current._id);
    await renewTimetableMutationLock(lock);
    const action = current.status === status ? "assessment.update" : `assessment.${status}`;
    const updated = await auditedMutation(actor, action, id, {
      academicYear: input.academicYear,
      semester: input.semester,
      date: input.date,
      assessmentType: input.assessmentType,
      status,
      studentCount: String(resolved.studentIds.length),
    }, async (session) => {
      if (reviewId) await completePublicationReview(reviewId, actor, session);
      const saved = await AssessmentAllocation.findOneAndUpdate(
        { _id: id, __v: expectedVersion },
        {
        $set: {
          academicYear: input.academicYear,
          semester: input.semester,
          department: input.department,
          course: input.course,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          room: input.room,
          title: input.title,
          assessmentType: input.assessmentType,
          status,
          studentIds: resolved.studentIds,
          invigilatorIds: input.invigilatorIds.map((invigilatorId) => new mongoose.Types.ObjectId(invigilatorId)),
        },
        $inc: { __v: 1 },
        ...(status === "draft" ? { $addToSet: { preparedBy: actor } } : {}),
        },
        { new: true, runValidators: true, session }
      ).lean();
      if (!saved) throw new AssessmentServiceError("This assessment changed while being saved. Reload it and retry.", 409);
      return saved;
    });
    return updated;
  } finally {
    if (lock) await releaseTimetableMutationLock(lock);
  }
}

export function validateAssessmentFilters(filters: Record<string, string | null>) {
  if (filters.academicYear !== null && (!filters.academicYear.trim() || filters.academicYear.trim().length > 30)) {
    return "academicYear must be between 1 and 30 characters.";
  }
  if (filters.semester !== null && (!filters.semester.trim() || filters.semester.trim().length > 50)) {
    return "semester must be between 1 and 50 characters.";
  }
  if (filters.department !== null && !/^[a-f\d]{24}$/i.test(filters.department)) return "department must be a valid id.";
  if (filters.date !== null && !validateDateOnly(filters.date)) return "date must be a real YYYY-MM-DD date.";
  return null;
}
