import { timeToMinutes, WEEKDAYS } from "./timetable.ts";
import { distanceMeters } from "./timetableGenerator.ts";

export type PublishCourse = {
  id: string;
  code: string;
  sessionsPerWeek: number;
  sessionMinutes: number;
  preferredVenues: string[];
  preferredSpaceTypes: string[];
};

export type PublishRoom = {
  id: string;
  capacity: number;
  latitude: number;
  longitude: number;
  available: boolean;
  spaceType: string;
};

export type PublishAllocation = {
  id: string;
  courseId: string;
  roomId: string;
  cohort: string;
  lecturer: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  stream: string;
  streamSize: number;
  studentIds: string[];
};

export function validateTimetableForPublishing(
  courses: PublishCourse[],
  allocations: PublishAllocation[],
  rooms: PublishRoom[],
  studentIdsByCourse: Map<string, string[]>,
  maxVenueRadiusM = 500
) {
  const errors = new Set<string>();
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const courseIds = new Set(courses.map((course) => course.id));
  const allocationsByCourse = new Map<string, PublishAllocation[]>();
  for (const allocation of allocations) {
    const courseAllocations = allocationsByCourse.get(allocation.courseId) || [];
    courseAllocations.push(allocation);
    allocationsByCourse.set(allocation.courseId, courseAllocations);
  }

  for (const course of courses) {
    const roster = [...new Set(studentIdsByCourse.get(course.id) || [])];
    const rosterSet = new Set(roster);
    const rows = allocationsByCourse.get(course.id) || [];
    if (!roster.length) {
      errors.add(`${course.code} has no active student enrolments.`);
      continue;
    }
    if (!rows.length) {
      errors.add(`${course.code} has no scheduled class sessions.`);
      continue;
    }

    const coveredStudents = new Set<string>();
    const streamRows = new Map<string, PublishAllocation[]>();
    for (const row of rows) {
      const grouped = streamRows.get(row.stream) || [];
      grouped.push(row);
      streamRows.set(row.stream, grouped);
    }
    for (const [stream, sessions] of streamRows) {
      if (sessions.length !== course.sessionsPerWeek) {
        errors.add(`${course.code}${stream ? ` ${stream}` : ""} needs exactly ${course.sessionsPerWeek} weekly sessions.`);
      }
      const days = sessions.map((session) => session.dayOfWeek);
      if (days.some((day) => !WEEKDAYS.includes(day as (typeof WEEKDAYS)[number])) || new Set(days).size !== days.length) {
        errors.add(`${course.code}${stream ? ` ${stream}` : ""} has an invalid or repeated weekday.`);
      }

      const members = sessions[0]?.studentIds || [];
      const memberSet = new Set(members);
      if (!members.length || memberSet.size !== members.length ||
          sessions.some((session) => session.studentIds.length !== memberSet.size || session.studentIds.some((id) => !memberSet.has(id)))) {
        errors.add(`${course.code}${stream ? ` ${stream}` : ""} has missing or inconsistent student assignments.`);
        continue;
      }
      if (members.some((id) => !rosterSet.has(id)) || members.some((id) => coveredStudents.has(id))) {
        errors.add(`${course.code} streams contain non-enrolled or duplicate students.`);
      }
      members.forEach((id) => coveredStudents.add(id));

      const firstRoom = roomsById.get(course.preferredVenues[0] || sessions[0].roomId);
      for (const session of sessions) {
        const room = roomsById.get(session.roomId);
        const start = timeToMinutes(session.startTime);
        const end = timeToMinutes(session.endTime);
        if (start === null || end === null || start >= end || end - start !== course.sessionMinutes) {
          errors.add(`${course.code} contains an invalid session time or incorrect session length.`);
        }
        if (!room || !room.available || !["lecture_room", "laboratory", "seminar_room"].includes(room.spaceType)) {
          errors.add(`${course.code} uses a missing, offline, or non-teaching venue.`);
          continue;
        }
        if (!Number.isFinite(room.capacity) || room.capacity < members.length || session.streamSize !== members.length) {
          errors.add(`${course.code} exceeds a venue's capacity or has incorrect stream-size data.`);
        }
        if (course.preferredVenues.length && !course.preferredVenues.includes(room.id)) {
          errors.add(`${course.code} uses a venue outside its preferred venue list.`);
        }
        if (course.preferredSpaceTypes.length && !course.preferredSpaceTypes.includes(room.spaceType)) {
          errors.add(`${course.code} uses a venue outside its preferred teaching-space types.`);
        }
        if (firstRoom && firstRoom.id !== room.id && distanceMeters(firstRoom, room) > maxVenueRadiusM) {
          errors.add(`${course.code} uses venues more than ${maxVenueRadiusM} m apart.`);
        }
      }
    }
    if (coveredStudents.size !== roster.length || roster.some((id) => !coveredStudents.has(id))) {
      errors.add(`${course.code} does not assign every active student to exactly one stream.`);
    }
  }

  const allocationsByDay = new Map<string, PublishAllocation[]>();
  const studentSets = new Map(allocations.map((allocation) => [allocation, new Set(allocation.studentIds)]));
  for (const allocation of allocations) {
    const day = allocationsByDay.get(allocation.dayOfWeek) || [];
    day.push(allocation);
    allocationsByDay.set(allocation.dayOfWeek, day);
  }
  const usedRooms = [...new Set(allocations.map((allocation) => allocation.roomId))]
    .map((id) => roomsById.get(id))
    .filter((room): room is PublishRoom => Boolean(room));
  let maxTravelMinutes = 10;
  for (let i = 0; i < usedRooms.length; i += 1) {
    for (let j = i + 1; j < usedRooms.length; j += 1) {
      maxTravelMinutes = Math.max(maxTravelMinutes, distanceMeters(usedRooms[i], usedRooms[j]) / 70 + 10);
    }
  }
  if (!Number.isFinite(maxTravelMinutes)) maxTravelMinutes = 24 * 60;

  for (const dayAllocations of allocationsByDay.values()) {
    const sorted = dayAllocations
      .map((allocation) => ({ allocation, start: timeToMinutes(allocation.startTime), end: timeToMinutes(allocation.endTime) }))
      .filter((item): item is { allocation: PublishAllocation; start: number; end: number } => item.start !== null && item.end !== null)
      .sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i += 1) {
      const { allocation: first, start: firstStart, end: firstEnd } = sorted[i];
      for (let j = i + 1; j < sorted.length; j += 1) {
        const { allocation: second, start: secondStart, end: secondEnd } = sorted[j];
        if (secondStart >= firstEnd && secondStart - firstEnd > maxTravelMinutes) break;
        if (!courseIds.has(first.courseId) && !courseIds.has(second.courseId)) continue;
        const firstStudents = studentSets.get(first) || new Set<string>();
        const secondStudents = studentSets.get(second) || new Set<string>();
        const smaller = firstStudents.size <= secondStudents.size ? firstStudents : secondStudents;
        const larger = smaller === firstStudents ? secondStudents : firstStudents;
        const sharedStudents = [...smaller].some((id) => larger.has(id));
        const unknownCohort = (!first.studentIds.length || !second.studentIds.length) && first.cohort === second.cohort;
        const sameRoom = first.roomId === second.roomId;
        const sameLecturer = Boolean(first.lecturer && first.lecturer.trim().toLowerCase() === second.lecturer.trim().toLowerCase());
        if (!sharedStudents && !unknownCohort && !sameRoom && !sameLecturer) continue;
        if (firstStart < secondEnd && firstEnd > secondStart) {
          errors.add("Published classes overlap for a shared room, lecturer, cohort, or student.");
          continue;
        }
        const gap = firstStart >= secondEnd ? firstStart - secondEnd : secondStart - firstEnd;
        const firstRoom = roomsById.get(first.roomId);
        const secondRoom = roomsById.get(second.roomId);
        const walkMinutes = sameRoom ? 0 : firstRoom && secondRoom ? distanceMeters(firstRoom, secondRoom) / 70 : Number.POSITIVE_INFINITY;
        if (!Number.isFinite(walkMinutes) || walkMinutes + 10 > gap) {
          errors.add("Published classes do not leave enough time to move between venues.");
        }
      }
    }
  }

  return [...errors];
}
