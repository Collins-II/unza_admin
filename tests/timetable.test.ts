import assert from "node:assert/strict";
import test from "node:test";

import { generateTimetable, type GeneratorCourse, type GeneratorRoom } from "../lib/timetableGenerator.ts";
import { validateTimetableForPublishing } from "../lib/timetableValidation.ts";

const rooms: GeneratorRoom[] = [
  { id: "room-a", code: "A", name: "Room A", capacity: 70, latitude: -15.4, longitude: 28.2, available: true, spaceType: "lecture_room" },
  { id: "room-b", code: "B", name: "Room B", capacity: 60, latitude: -15.4, longitude: 28.201, available: true, spaceType: "lecture_room" },
];

function course(studentIds: string[], overrides: Partial<GeneratorCourse> = {}): GeneratorCourse {
  return {
    id: "course-1",
    code: "CS101",
    title: "Computer Science",
    departmentCode: "CS",
    level: "1",
    expectedEnrollment: studentIds.length,
    lecturer: "Professor One",
    sessionsPerWeek: 2,
    sessionMinutes: 60,
    venueIds: ["room-a", "room-b"],
    preferredSpaceTypes: ["lecture_room"],
    studentIds,
    ...overrides,
  };
}

const students = (count: number) => Array.from({ length: count }, (_, index) => `student-${index + 1}`);

test("splits enrolled students across nearby venues with complete weekly sessions", () => {
  const roster = students(130);
  const result = generateTimetable([course(roster)], rooms, []);

  assert.equal(result.unscheduled.length, 0);
  assert.equal(result.sessions.length, 4);
  const streams = new Map<string, typeof result.sessions>();
  for (const session of result.sessions) {
    const stream = streams.get(session.stream) || [];
    stream.push(session);
    streams.set(session.stream, stream);
    assert.ok(session.streamSize <= (rooms.find((room) => room.id === session.roomId)?.capacity || 0));
  }
  assert.equal(streams.size, 2);
  const assigned = new Set<string>();
  for (const stream of streams.values()) {
    assert.equal(stream.length, 2);
    assert.equal(new Set(stream.map((session) => session.dayOfWeek)).size, 2);
    assert.equal(stream[0].streamSize, stream[0].studentIds.length);
    assert.deepEqual(stream[0].studentIds, stream[1].studentIds);
    for (const id of stream[0].studentIds) {
      assert.ok(!assigned.has(id));
      assigned.add(id);
    }
  }
  assert.deepEqual([...assigned].sort(), [...roster].sort());
  assert.ok(result.sessions.some((session) => session.roomId === "room-b"));
  assert.deepEqual(
    validateTimetableForPublishing(
      [{ id: "course-1", code: "CS101", sessionsPerWeek: 2, sessionMinutes: 60, preferredVenues: ["room-a", "room-b"], preferredSpaceTypes: ["lecture_room"] }],
      result.sessions.map((session, index) => ({
        id: `allocation-${index}`,
        courseId: session.courseId,
        roomId: session.roomId,
        cohort: session.group,
        lecturer: session.lecturer || "",
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        stream: session.stream,
        streamSize: session.streamSize,
        studentIds: session.studentIds,
      })),
      rooms.map((room) => ({ ...room })),
      new Map([["course-1", roster]])
    ),
    []
  );
});

test("rolls back all newly planned classes when stream limits leave students unscheduled", () => {
  const result = generateTimetable(
    [course(students(250), { venueIds: ["room-a"] })],
    rooms,
    [],
    { maxStreams: 2 }
  );

  assert.equal(result.unscheduled.length, 1);
  assert.equal(result.unscheduled[0].studentsUnplaced, 250);
  assert.equal(result.sessions.length, 0);
});

test("completes partial existing streams on additional days", () => {
  const roster = students(50);
  const result = generateTimetable(
    [course(roster, {
      existingStreams: [{
        label: "Stream A",
        studentIds: roster,
        scheduledSessions: 1,
        scheduledDays: ["Monday"],
        anchorRoomId: "room-a",
      }],
    })],
    rooms,
    [{
      courseId: "course-1",
      roomId: "room-a",
      group: "CS 1",
      lecturer: "Professor One",
      dayOfWeek: "Monday",
      startTime: "08:00",
      endTime: "09:00",
      stream: "Stream A",
      studentIds: roster,
    }]
  );

  assert.equal(result.unscheduled.length, 0);
  assert.equal(result.sessions.length, 1);
  assert.notEqual(result.sessions[0].dayOfWeek, "Monday");
  assert.equal(result.sessions[0].stream, "Stream A");
  assert.equal(result.sessions[0].streamSize, 50);
});

test("rejects malformed time input before scheduling", () => {
  assert.throws(
    () => generateTimetable([course(students(10))], rooms, [], { dayStart: "25:00" }),
    RangeError
  );
});

test("requires enrolled students and valid room coordinates, and honors laboratory space types", () => {
  const emptyRoster = generateTimetable([course([], { expectedEnrollment: 40 })], rooms, []);
  assert.equal(emptyRoster.unscheduled[0].studentsUnplaced, 40);
  assert.equal(emptyRoster.sessions.length, 0);

  const invalidRoom = { ...rooms[0], latitude: 0, longitude: 0 };
  const invalidLocation = generateTimetable(
    [course(students(10), { venueIds: [] })],
    [invalidRoom],
    []
  );
  assert.equal(invalidLocation.unscheduled.length, 1);

  const lab = { ...rooms[0], id: "lab", code: "LAB", spaceType: "laboratory" };
  const labResult = generateTimetable(
    [course(students(10), { venueIds: [], preferredSpaceTypes: ["laboratory"], sessionsPerWeek: 1 })],
    [rooms[0], lab],
    []
  );
  assert.equal(labResult.unscheduled.length, 0);
  assert.equal(labResult.sessions[0].roomId, "lab");
});

test("does not accept an existing stream containing students outside the active roster", () => {
  const activeRoster = students(10);
  const result = generateTimetable(
    [course(activeRoster, {
      existingStreams: [{
        label: "Stream A",
        studentIds: [...activeRoster.slice(0, 9), "former-student"],
        scheduledSessions: 1,
        scheduledDays: ["Monday"],
      }],
    })],
    rooms,
    []
  );

  assert.equal(result.unscheduled.length, 1);
  assert.equal(result.sessions.length, 0);
});

test("publication validation rejects insufficient travel time and accepts a safe gap", () => {
  const scheduleCourse = (id: string, code: string, roomId: string) => ({
    id,
    code,
    sessionsPerWeek: 1,
    sessionMinutes: 60,
    preferredVenues: [roomId],
    preferredSpaceTypes: ["lecture_room"],
  });
  const rows = (secondStart: string) => [
    {
      id: "allocation-a", courseId: "course-a", roomId: "room-a", cohort: "CS 1", lecturer: "",
      dayOfWeek: "Monday", startTime: "08:00", endTime: "09:00", stream: "", streamSize: 2, studentIds: ["student-1", "student-2"],
    },
    {
      id: "allocation-b", courseId: "course-b", roomId: "room-b", cohort: "BIO 1", lecturer: "",
      dayOfWeek: "Monday", startTime: secondStart, endTime: secondStart === "09:05" ? "10:05" : "10:30", stream: "", streamSize: 2, studentIds: ["student-1", "student-2"],
    },
  ];
  const courses = [scheduleCourse("course-a", "CS101", "room-a"), scheduleCourse("course-b", "BIO101", "room-b")];
  const roster = new Map([["course-a", ["student-1", "student-2"]], ["course-b", ["student-1", "student-2"]]]);

  assert.ok(validateTimetableForPublishing(courses, rows("09:05"), rooms, roster).some((error) => error.includes("move between venues")));
  assert.deepEqual(validateTimetableForPublishing(courses, rows("09:30"), rooms, roster), []);
  const radiusCourse = { ...scheduleCourse("course-a", "CS101", "room-a"), sessionsPerWeek: 2, preferredVenues: ["room-a", "room-b"] };
  const radiusRows = [
    { ...rows("09:30")[0], dayOfWeek: "Monday" },
    { ...rows("09:30")[0], id: "allocation-a2", roomId: "room-b", dayOfWeek: "Tuesday" },
  ];
  assert.ok(validateTimetableForPublishing([radiusCourse], radiusRows, rooms, new Map([["course-a", roster.get("course-a")!]]), 50).some((error) => error.includes("more than 50 m")));
  assert.ok(validateTimetableForPublishing(courses, rows("09:30"), rooms, new Map([
    ["course-a", ["student-1", "student-2", "student-3"]],
    ["course-b", ["student-1", "student-2"]],
  ])).some((error) => error.includes("assign every active student")));
});
