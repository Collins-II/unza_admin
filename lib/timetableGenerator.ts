import { timeToMinutes, WEEKDAYS } from "./timetable.ts";

export type GeneratorRoom = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  latitude: number;
  longitude: number;
  available: boolean;
  spaceType: string;
};

export type GeneratorCourse = {
  id: string;
  code: string;
  title: string;
  departmentCode: string;
  level: string;
  expectedEnrollment: number;
  lecturer?: string;
  sessionsPerWeek: number;
  sessionMinutes: number;
  venueIds: string[];
  preferredSpaceTypes: string[];
  studentIds: string[];
  existingStreams?: {
    label: string;
    studentIds: string[];
    scheduledSessions: number;
    scheduledDays: string[];
    anchorRoomId?: string;
  }[];
};

export type FixedAllocation = {
  courseId: string;
  roomId: string;
  group: string;
  lecturer?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  stream?: string;
  studentIds?: string[];
};

export type GeneratorOptions = {
  days?: string[];
  dayStart?: string;
  dayEnd?: string;
  lunchStart?: string;
  lunchEnd?: string;
  stepMinutes?: number;
  maxVenueRadiusM?: number;
  walkMetersPerMinute?: number;
  changeoverMinutes?: number;
  maxStreams?: number;
};

export type PlannedSession = {
  courseId: string;
  roomId: string;
  group: string;
  lecturer?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  stream: string;
  streamIndex: number;
  streamCount: number;
  streamSize: number;
  sessionIndex: number;
  studentIds: string[];
};

export type UnscheduledCourse = { courseId: string; courseCode: string; reason: string; studentsUnplaced: number };
export type SkippedCourse = { courseId: string; courseCode: string; reason: string };

export type GeneratorResult = {
  sessions: PlannedSession[];
  unscheduled: UnscheduledCourse[];
  warnings: string[];
  stats: { courses: number; sessions: number; streams: number; splitCourses: number; unscheduledCourses: number };
};

export const DEFAULT_VENUE_RADIUS_M = 500;
export const TEACHING_SPACES = ["lecture_room", "laboratory", "seminar_room"];
const DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const CANDIDATE_BRANCHING = 8;
const MAX_SEARCH_NODES_PER_COURSE = 5000;

export const toMinutes = (time: string) => {
  const minutes = timeToMinutes(time);
  if (minutes === null) throw new RangeError(`Invalid 24-hour time: ${time}`);
  return minutes;
};
export const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const isValidTimeRange = (start: string, end: string) => {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return startMinutes !== null && endMinutes !== null && startMinutes < endMinutes;
};

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite) ||
      Math.abs(a.latitude) > 90 || Math.abs(b.latitude) > 90 ||
      Math.abs(a.longitude) > 180 || Math.abs(b.longitude) > 180) return Number.POSITIVE_INFINITY;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Slot = { start: number; end: number; roomId: string; courseId: string; stream: string; group: string; lecturer: string; studentIds: string[] };
type Candidate = { room: GeneratorRoom; day: string; start: number; score: number; studentIds: string[] };
type PlannedStream = { size: number; studentIds: string[]; label: string; streamIndex: number; scheduledSessions: number; slots: { day: string; slot: Slot }[] };

const lecturerKey = (lecturer?: string) => (lecturer || "").trim().toLowerCase();
const hasValidLocation = (room: GeneratorRoom) =>
  Number.isFinite(room.latitude) && room.latitude >= -90 && room.latitude <= 90 &&
  Number.isFinite(room.longitude) && room.longitude >= -180 && room.longitude <= 180 &&
  (room.latitude !== 0 || room.longitude !== 0);

/** Tracks who and what is busy so every placement can be checked in one place. */
class Ledger {
  private byRoom = new Map<string, Slot[]>();
  private byLecturer = new Map<string, Slot[]>();
  private byGroup = new Map<string, Slot[]>();
  private byStudent = new Map<string, Slot[]>();

  private push(map: Map<string, Slot[]>, key: string, slot: Slot) {
    const list = map.get(key);
    if (list) list.push(slot);
    else map.set(key, [slot]);
  }

  private drop(map: Map<string, Slot[]>, key: string, slot: Slot) {
    const list = map.get(key);
    const index = list ? list.indexOf(slot) : -1;
    if (list && index >= 0) list.splice(index, 1);
  }

  add(day: string, slot: Slot) {
    this.push(this.byRoom, `${slot.roomId}|${day}`, slot);
    if (slot.studentIds.length) {
      for (const studentId of slot.studentIds) this.push(this.byStudent, `${studentId}|${day}`, slot);
    } else if (slot.group) {
      this.push(this.byGroup, `${slot.group}|${day}`, slot);
    }
    if (slot.lecturer) this.push(this.byLecturer, `${slot.lecturer}|${day}`, slot);
  }

  remove(day: string, slot: Slot) {
    this.drop(this.byRoom, `${slot.roomId}|${day}`, slot);
    if (slot.studentIds.length) {
      for (const studentId of slot.studentIds) this.drop(this.byStudent, `${studentId}|${day}`, slot);
    } else if (slot.group) {
      this.drop(this.byGroup, `${slot.group}|${day}`, slot);
    }
    if (slot.lecturer) this.drop(this.byLecturer, `${slot.lecturer}|${day}`, slot);
  }

  room(roomId: string, day: string) {
    return this.byRoom.get(`${roomId}|${day}`) || [];
  }

  lecturer(lecturer: string, day: string) {
    return lecturer ? this.byLecturer.get(`${lecturer}|${day}`) || [] : [];
  }

  group(group: string, day: string) {
    return this.byGroup.get(`${group}|${day}`) || [];
  }

  students(studentIds: string[], day: string) {
    const slots = new Set<Slot>();
    for (const studentId of studentIds) {
      for (const slot of this.byStudent.get(`${studentId}|${day}`) || []) slots.add(slot);
    }
    return [...slots];
  }
}

/**
 * Builds a conflict-free weekly timetable.
 * - Streams: when no venue can hold a course's cohort, the remainder is passed on to further venue slots.
 * - Multi-venue: a course may use several venues, all kept within a walking radius of its anchor venue.
 * - Movement: consecutive classes for a cohort or lecturer must leave enough time to walk between venues.
 */
export function generateTimetable(courses: GeneratorCourse[], rooms: GeneratorRoom[], fixed: FixedAllocation[], options: GeneratorOptions = {}): GeneratorResult {
  const days = options.days?.length ? options.days : DEFAULT_DAYS;
  const dayStartValue = options.dayStart || "08:00";
  const dayEndValue = options.dayEnd || "18:00";
  const lunchStartValue = options.lunchStart || "13:00";
  const lunchEndValue = options.lunchEnd || "14:00";
  if (![dayStartValue, dayEndValue, lunchStartValue, lunchEndValue].every((time) => timeToMinutes(time) !== null)) {
    throw new RangeError("Teaching and lunch times must be valid 24-hour times.");
  }
  const dayStart = toMinutes(dayStartValue);
  const dayEnd = toMinutes(dayEndValue);
  const lunchStart = toMinutes(lunchStartValue);
  const lunchEnd = toMinutes(lunchEndValue);
  const step = options.stepMinutes ?? 30;
  const radius = options.maxVenueRadiusM ?? DEFAULT_VENUE_RADIUS_M;
  const walkSpeed = options.walkMetersPerMinute ?? 70;
  const changeover = options.changeoverMinutes ?? 10;
  const maxStreams = options.maxStreams ?? 8;
  if (dayStart >= dayEnd || lunchStart >= lunchEnd || step < 1 || !Number.isInteger(step) || radius < 0 ||
      !Number.isFinite(radius) || walkSpeed <= 0 || !Number.isFinite(walkSpeed) || changeover < 0 ||
      !Number.isFinite(changeover) || maxStreams < 1 || !Number.isInteger(maxStreams) ||
      days.some((day) => !WEEKDAYS.includes(day as (typeof WEEKDAYS)[number])) || new Set(days).size !== days.length) {
    throw new RangeError("Timetable generation options are outside valid ranges.");
  }

  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const ledger = new Ledger();
  const warnings: string[] = [];
  const sessions: PlannedSession[] = [];
  const unscheduled: UnscheduledCourse[] = [];
  let streamTotal = 0;
  let splitCourses = 0;

  for (const allocation of fixed) {
    if (!WEEKDAYS.includes(allocation.dayOfWeek as (typeof WEEKDAYS)[number]) ||
        !isValidTimeRange(allocation.startTime, allocation.endTime) || !roomsById.has(allocation.roomId)) {
      throw new RangeError("Existing timetable allocations contain an invalid day, time range, or venue.");
    }
    ledger.add(allocation.dayOfWeek, {
      start: toMinutes(allocation.startTime),
      end: toMinutes(allocation.endTime),
      roomId: allocation.roomId,
      courseId: allocation.courseId,
      stream: allocation.stream || "",
      group: allocation.group,
      lecturer: lecturerKey(allocation.lecturer),
      studentIds: allocation.studentIds || [],
    });
  }

  const walkMinutes = (roomA: string, roomB: string) => {
    const a = roomsById.get(roomA);
    const b = roomsById.get(roomB);
    return a && b && roomA !== roomB ? distanceMeters(a, b) / walkSpeed : 0;
  };

  // Returns accumulated walk minutes, or null if a nearby transition is impossible.
  const checkTransitions = (against: Slot[], roomId: string, start: number, end: number, sameStudents: (slot: Slot) => boolean) => {
    let walked = 0;
    for (const slot of against) {
      if (!sameStudents(slot)) continue;
      if (start < slot.end && end > slot.start) return null;
      const gap = start >= slot.end ? start - slot.end : slot.start - end;
      const needed = walkMinutes(roomId, slot.roomId);
      if (needed + changeover > gap) return null;
      if (gap <= 60) walked += needed;
    }
    return walked;
  };

  const startTimes = (duration: number) => {
    const starts: number[] = [];
    for (let start = dayStart; start + duration <= dayEnd; start += step) {
      if (start < lunchEnd && start + duration > lunchStart) continue;
      starts.push(start);
    }
    return starts;
  };

  const poolFor = (course: GeneratorCourse, anchor: GeneratorRoom | null) => {
    const base = course.venueIds.length
      ? course.venueIds.map((id) => roomsById.get(id)).filter((room): room is GeneratorRoom => Boolean(room && room.available && hasValidLocation(room) && Number.isFinite(room.capacity) && room.capacity > 0 && course.preferredSpaceTypes.includes(room.spaceType)))
      : rooms.filter((room) => room.available && hasValidLocation(room) && Number.isFinite(room.capacity) && room.capacity > 0 && course.preferredSpaceTypes.includes(room.spaceType));
    return anchor ? base.filter((room) => room.id === anchor.id || distanceMeters(room, anchor) <= radius) : base;
  };

  const findCandidates = (course: GeneratorCourse, pool: GeneratorRoom[], ctx: { group: string; stream: string; minCapacity: number; studentIds: string[]; splitStudents?: boolean; usedDays: Set<string> }) => {
    const lecturer = lecturerKey(course.lecturer);
    const starts = startTimes(course.sessionMinutes);
    const found: Candidate[] = [];
    for (const day of days) {
      if (ctx.usedDays.has(day)) continue;
      const lecturerSlots = ledger.lecturer(lecturer, day);
      for (const start of starts) {
        const end = start + course.sessionMinutes;
        for (const room of pool) {
          if (room.capacity < ctx.minCapacity) continue;
          if (checkTransitions(ledger.room(room.id, day), room.id, start, end, () => true) === null) continue;
          const lecturerWalk = checkTransitions(lecturerSlots, room.id, start, end, () => true);
          if (lecturerWalk === null) continue;
          const studentIds = ctx.splitStudents
            ? ctx.studentIds.slice(0, Math.min(ctx.studentIds.length, room.capacity))
            : ctx.studentIds;
          const groupSlots = [...new Set([...ledger.students(studentIds, day), ...ledger.group(ctx.group, day)])];
          const groupWalk = checkTransitions(groupSlots, room.id, start, end, () => true);
          if (groupWalk === null) continue;
          const remaining = ctx.studentIds.length;
          let score = (room.capacity - Math.min(remaining || ctx.minCapacity, room.capacity)) * 2;
          if (remaining) score += (remaining - Math.min(remaining, room.capacity)) * 100;
          score += groupSlots.length * 25 + lecturerSlots.length * 10;
          score += (groupWalk + lecturerWalk) / 20 + (start - dayStart) / step;
          found.push({ room, day, start, score, studentIds });
        }
      }
    }
    return found.sort((a, b) => a.score - b.score);
  };

  const ordered = [...courses].sort((a, b) => b.expectedEnrollment - a.expectedEnrollment || b.sessionsPerWeek - a.sessionsPerWeek);

  for (const course of ordered) {
    const group = `${course.departmentCode} ${course.level}`.trim();
    const lecturer = lecturerKey(course.lecturer);
    if (!Number.isInteger(course.sessionsPerWeek) || course.sessionsPerWeek < 1 || course.sessionsPerWeek > 6 ||
        !Number.isInteger(course.sessionMinutes) || course.sessionMinutes < 30 || course.sessionMinutes > 300 || course.sessionMinutes % 30 !== 0) {
      unscheduled.push({ courseId: course.id, courseCode: course.code, reason: "Course weekly session settings are invalid.", studentsUnplaced: course.studentIds.length });
      continue;
    }
    if (!course.studentIds.length) {
      unscheduled.push({ courseId: course.id, courseCode: course.code, reason: "No active student enrolments are linked to this course.", studentsUnplaced: course.expectedEnrollment });
      continue;
    }
    if (new Set(course.studentIds).size !== course.studentIds.length) {
      unscheduled.push({ courseId: course.id, courseCode: course.code, reason: "The course roster contains duplicate student records.", studentsUnplaced: course.studentIds.length });
      continue;
    }
    if (course.expectedEnrollment !== course.studentIds.length) {
      warnings.push(`${course.code}: expected enrollment is ${course.expectedEnrollment}, but ${course.studentIds.length} active students are enrolled; the roster count is used.`);
    }
    const explicit = course.venueIds.map((id) => roomsById.get(id)).filter((room): room is GeneratorRoom => Boolean(room && room.available && hasValidLocation(room) && Number.isFinite(room.capacity) && room.capacity > 0 && course.preferredSpaceTypes.includes(room.spaceType)));
    let anchor: GeneratorRoom | null = explicit[0] || null;
    if (course.venueIds.length && !explicit.length) {
      unscheduled.push({ courseId: course.id, courseCode: course.code, reason: "None of the assigned venues are available.", studentsUnplaced: course.expectedEnrollment });
      continue;
    }
    const excluded = anchor ? explicit.filter((room) => room.id !== anchor?.id && distanceMeters(room, anchor as GeneratorRoom) > radius) : [];
    if (excluded.length) warnings.push(`${course.code}: ${excluded.map((room) => room.code).join(", ")} lie beyond ${radius} m of ${anchor?.code} and were ignored.`);

    let studentOffset = 0;
    const streams: PlannedStream[] = [];
    const committedSlots: { day: string; slot: Slot }[] = [];
    let failure = "";
    let unplacedStudents = 0;
    const assignedStudents = new Set<string>();
    const enrolledStudents = new Set(course.studentIds);
    let searchNodes = 0;
    let searchLimitReached = false;

    const scheduleMissingSessions = (
      streamKey: string,
      studentIds: string[],
      alreadyScheduled: number,
      scheduledDays: string[],
      roomAnchor: GeneratorRoom | null,
      streamIndex: number,
      label: string
    ) => {
      const attempt: { day: string; slot: Slot }[] = [];
      const usedDays = new Set(scheduledDays);
      const missing = course.sessionsPerWeek - alreadyScheduled;
      const placeAt = (index: number): boolean => {
        searchNodes += 1;
        if (searchNodes > MAX_SEARCH_NODES_PER_COURSE) {
          searchLimitReached = true;
          return false;
        }
        if (index >= missing) return true;
        const candidates = findCandidates(course, poolFor(course, roomAnchor), {
          group,
          stream: streamKey,
          minCapacity: studentIds.length,
          studentIds,
          usedDays,
        }).slice(0, CANDIDATE_BRANCHING);
        for (const candidate of candidates) {
          const slot: Slot = {
            start: candidate.start,
            end: candidate.start + course.sessionMinutes,
            roomId: candidate.room.id,
            courseId: course.id,
            stream: streamKey,
            group,
            lecturer,
            studentIds,
          };
          ledger.add(candidate.day, slot);
          attempt.push({ day: candidate.day, slot });
          usedDays.add(candidate.day);
          if (placeAt(index + 1)) return true;
          usedDays.delete(candidate.day);
          attempt.pop();
          ledger.remove(candidate.day, slot);
        }
        return false;
      };
      if (!placeAt(0)) {
        for (const { day, slot } of attempt) ledger.remove(day, slot);
        return null;
      }
      return { size: studentIds.length, studentIds, label, streamIndex, scheduledSessions: alreadyScheduled, slots: attempt };
    };

    const existingStreams = course.existingStreams || [];
    if (existingStreams.length > maxStreams) {
      failure = `Existing schedule uses more than ${maxStreams} streams.`;
      unplacedStudents = course.studentIds.length;
    } else {
      for (let index = 0; index < existingStreams.length; index += 1) {
        const existing = existingStreams[index];
        const members = existing.studentIds.filter((id) => enrolledStudents.has(id));
        if (!members.length || members.length !== existing.studentIds.length || new Set(members).size !== members.length ||
            members.some((id) => assignedStudents.has(id))) {
          failure = "Existing streams contain duplicate or non-enrolled students.";
          unplacedStudents = course.studentIds.length;
          break;
        }
        members.forEach((id) => assignedStudents.add(id));
        if (existing.scheduledSessions > course.sessionsPerWeek) {
          failure = `Existing ${existing.label || "class"} has more sessions than the course's weekly requirement.`;
          unplacedStudents = course.studentIds.length;
          break;
        }
        const existingRoom = existing.anchorRoomId ? roomsById.get(existing.anchorRoomId) : null;
        const planned = scheduleMissingSessions(
          `#existing-${index}`,
          members,
          existing.scheduledSessions,
          existing.scheduledDays,
          existingRoom || anchor,
          index,
          existing.label
        );
        if (!planned) {
          failure = `Unable to complete ${existing.label || "the existing class"} for the remaining weekly sessions.`;
          unplacedStudents = members.length;
          break;
        }
        streams.push(planned);
        committedSlots.push(...planned.slots);
      }
    }

    if (!failure) {
      const remainingStudents = course.studentIds.filter((id) => !assignedStudents.has(id));
      studentOffset = 0;
      while (studentOffset < remainingStudents.length) {
        if (streams.length >= maxStreams) {
          failure = `Needs more than ${maxStreams} streams.`;
          unplacedStudents = remainingStudents.length - studentOffset;
          break;
        }
        const streamIndex = streams.length;
        const streamKey = `#new-${streamIndex}`;
        const unassigned = remainingStudents.slice(studentOffset);
        const firstCandidates = findCandidates(course, poolFor(course, anchor), {
          group,
          stream: streamKey,
          minCapacity: 1,
          studentIds: unassigned,
          splitStudents: true,
          usedDays: new Set(),
        }).slice(0, CANDIDATE_BRANCHING);
        let planned: PlannedStream | null = null;
        for (const first of firstCandidates) {
          const members = first.studentIds;
          const firstSlot: Slot = {
            start: first.start,
            end: first.start + course.sessionMinutes,
            roomId: first.room.id,
            courseId: course.id,
            stream: streamKey,
            group,
            lecturer,
            studentIds: members,
          };
          ledger.add(first.day, firstSlot);
          const remainder = scheduleMissingSessions(
            streamKey,
            members,
            1,
            [first.day],
            anchor || first.room,
            streamIndex,
            ""
          );
          ledger.remove(first.day, firstSlot);
          if (remainder) {
            ledger.add(first.day, firstSlot);
            planned = { ...remainder, slots: [{ day: first.day, slot: firstSlot }, ...remainder.slots] };
            break;
          }
        }
        if (!planned) {
          failure = searchLimitReached
            ? "Search limit reached before a complete weekly schedule could be proven."
            : streams.length
            ? `No further venue slots fit the remaining students within ${radius} m and travel-time limits.`
            : "No venue/time combination satisfies capacity, lecturer, student, and travel-time constraints.";
          unplacedStudents = remainingStudents.length - studentOffset;
          break;
        }
        streams.push(planned);
        committedSlots.push(...planned.slots);
        studentOffset += planned.size;
        anchor = anchor || roomsById.get(planned.slots[0].slot.roomId) || null;
      }
    }

    if (failure) {
      for (const { day, slot } of committedSlots) ledger.remove(day, slot);
      const alreadyComplete = new Set(
        existingStreams
          .filter((stream) => stream.scheduledSessions === course.sessionsPerWeek)
          .flatMap((stream) => stream.studentIds)
      );
      const incompleteCount = course.studentIds.filter((id) => !alreadyComplete.has(id)).length;
      unscheduled.push({ courseId: course.id, courseCode: course.code, reason: failure, studentsUnplaced: Math.max(unplacedStudents, incompleteCount) });
      continue;
    }

    const streamCount = streams.length;
    streams.forEach((stream) => {
      const generatedLabel = streamCount > 1 ? `Stream ${String.fromCharCode(65 + stream.streamIndex)}` : "";
      const label = stream.label || generatedLabel;
      stream.slots.forEach(({ day, slot }, sessionIndex) => {
        slot.stream = label;
        sessions.push({
          courseId: course.id,
          roomId: slot.roomId,
          group,
          lecturer: course.lecturer,
          dayOfWeek: day,
          startTime: toTime(slot.start),
          endTime: toTime(slot.end),
          stream: label,
          streamIndex: stream.streamIndex,
          streamCount,
          streamSize: stream.size,
          sessionIndex: stream.scheduledSessions + sessionIndex,
          studentIds: stream.studentIds,
        });
      });
    });
    streamTotal += streams.length;
    if (streams.length > 1) splitCourses += 1;
  }

  return {
    sessions,
    unscheduled,
    warnings,
    stats: { courses: courses.length, sessions: sessions.length, streams: streamTotal, splitCourses, unscheduledCourses: unscheduled.length },
  };
}
