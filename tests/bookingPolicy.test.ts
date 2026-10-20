import assert from "node:assert/strict";
import test from "node:test";
import Room from "../lib/database/models/Room.ts";
import {
  DAY_MS, isBookableLectureRoom, parseTutorialGroup, validateBookingDetails, validateBookingSchedule,
} from "../lib/bookingPolicy.ts";

const submittedAt = new Date("2030-01-01T10:00:00Z");
const tg = { groupName: "Calculus TG", courseCode: "mat101", topic: "Integration revision", leaderName: "Group leader" };

for (const [purpose, days, delta, valid] of [
  ["Tutorial Group", 2, -1, false], ["Tutorial Group", 2, 0, true], ["Tutorial Group", 100, 0, true],
  ["Event", 7, -1, false], ["Event", 7, 0, true], ["Event", 14, 0, true], ["Event", 14, 1, false],
] as const) {
  test(`${purpose}: ${days} days ${delta}ms notice is ${valid ? "accepted" : "rejected"}`, () => {
    const start = new Date(submittedAt.getTime() + days * DAY_MS + delta);
    assert.equal(validateBookingSchedule(purpose, start, new Date(start.getTime() + 3600000), submittedAt) === null, valid);
  });
}

test("approval eligibility uses the original request time, not the review time", () => {
  const start = new Date(submittedAt.getTime() + 3 * DAY_MS);
  const end = new Date(start.getTime() + 3600000);
  assert.equal(validateBookingSchedule("Tutorial Group", start, end, submittedAt), null);
  assert.notEqual(validateBookingSchedule("Tutorial Group", start, end, new Date(start.getTime() - 3600000)), null);
});

test("invalid and reversed times are rejected explicitly", () => {
  const start = new Date(submittedAt.getTime() + 3 * DAY_MS);
  assert.notEqual(validateBookingSchedule("Tutorial Group", new Date("invalid"), start, submittedAt), null);
  assert.notEqual(validateBookingSchedule("Tutorial Group", start, start, submittedAt), null);
  assert.notEqual(validateBookingSchedule("Tutorial Group", start, new Date(start.getTime() - 1), submittedAt), null);
  assert.notEqual(validateBookingSchedule("Tutorial Group", start, new Date(start.getTime() + 3600000), new Date("invalid")), null);
});
test("only explicit lecture-room classifications grant student booking access", () => {
  for (const spaceType of ["library", "office", "laboratory", "seminar_room", "clinic", "residence"]) {
    assert.equal(isBookableLectureRoom({ spaceType, category: "lecture_room" }), false);
  }
  assert.equal(isBookableLectureRoom({ spaceType: "lecture_room" }), true);
  assert.equal(isBookableLectureRoom({ category: "lecture_hall" }), false);
  assert.equal(isBookableLectureRoom({ category: "lecture_room" }), false);
  assert.equal(isBookableLectureRoom({}), false);
});

test("room schema does not silently classify legacy campus locations as lecture rooms", () => {
  assert.equal(new Room({ name: "Main Library", category: "lecture_hall" }).spaceType, undefined);
});
test("TG details and attendee counts are mandatory and bounded; arbitrary purposes are rejected", () => {
  const request = { purpose: "Tutorial Group", tutorialGroup: tg, attendees: 12 };
  assert.equal(validateBookingDetails(request), null);
  assert.equal(parseTutorialGroup(tg)?.courseCode, "MAT101");
  for (const tutorialGroup of [undefined, {}, { ...tg, groupName: " " }, { ...tg, topic: "x".repeat(1001) }]) {
    assert.notEqual(validateBookingDetails({ ...request, tutorialGroup }), null);
  }
  for (const attendees of [undefined, "12", 0, -1, 1.5, NaN]) {
    assert.notEqual(validateBookingDetails({ ...request, attendees }), null);
  }
  assert.notEqual(validateBookingDetails({ ...request, purpose: "Private study" }), null);
  assert.notEqual(validateBookingDetails({ purpose: "Event", attendees: 10 }), null);
  assert.equal(validateBookingDetails({ purpose: "Event", title: "Society talk", attendees: 10 }), null);
});
