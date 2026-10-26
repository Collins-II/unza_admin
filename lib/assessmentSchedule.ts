import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import User from "@/lib/database/models/User";
import { getCampusDateTime, getCampusWeekday } from "@/lib/assessmentValidation";
import { rangesOverlap } from "@/lib/timetable";
import type { TimetableSlot } from "@/lib/bookingValidation";
import { termContainsTeachingDate, type AcademicTermInput } from "@/lib/academicCalendar";

export type AssessmentTeachingSlot = TimetableSlot & { lecturer?: string };

export async function teachingAssessmentConflict(slots: AssessmentTeachingSlot[], term?: Pick<AcademicTermInput, "teachingStartDate" | "teachingEndDate">) {
  if (!slots.length) return false;
  const assessments = await AssessmentAllocation.find({ status: { $ne: "cancelled" } })
    .select("date startTime endTime room studentIds invigilatorIds").lean();
  const invigilatorIds = [...new Set(assessments.flatMap((assessment) => assessment.invigilatorIds.map(String)))];
  const people = invigilatorIds.length ? await User.find({ _id: { $in: invigilatorIds } }).select("_id name").lean() : [];
  const nameById = new Map(people.map((person) => [String(person._id), String(person.name).trim().toLowerCase()]));
  return assessments.some((assessment) => slots.some((slot) => {
    if (term && !termContainsTeachingDate(term, assessment.date)) return false;
    if (getCampusWeekday(assessment.date) !== slot.dayOfWeek ||
        !rangesOverlap(assessment.startTime, assessment.endTime, slot.startTime, slot.endTime)) return false;
    const students = new Set(assessment.studentIds.map(String));
    const lecturers = (slot.lecturer || "").split("/").map((name) => name.trim().toLowerCase()).filter(Boolean);
    return String(assessment.room) === slot.roomId ||
      slot.studentIds?.some((id) => students.has(id)) ||
      assessment.invigilatorIds.some((id: unknown) => lecturers.includes(nameById.get(String(id)) || ""));
  }));
}

export async function bookingAssessmentConflict(roomId: string, studentId: string, start: Date, end: Date) {
  const assessments = await AssessmentAllocation.find({
    status: { $ne: "cancelled" },
    $or: [{ room: roomId }, { studentIds: studentId }],
  }).select("date startTime endTime").lean();
  return assessments.some((assessment) => {
    const assessmentStart = getCampusDateTime(assessment.date, assessment.startTime);
    const assessmentEnd = getCampusDateTime(assessment.date, assessment.endTime);
    if (!assessmentStart || !assessmentEnd) throw new Error("Stored assessment has invalid date/time. Correct it before updating room schedules.");
    return assessmentStart < end && assessmentEnd > start;
  });
}
