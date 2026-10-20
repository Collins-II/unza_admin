import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingConflictsWithTimetable,
  findTimetableConflictingBookings,
  getCampusTimeSlot,
  timetableConflictsWithBookings,
} from "../lib/bookingValidation.ts";

test("interprets booking times in the Lusaka campus timezone", () => {
  const slot = getCampusTimeSlot(
    new Date("2026-10-26T08:30:00+02:00"),
    new Date("2026-10-26T09:30:00+02:00")
  );

  assert.deepEqual(slot, { dayOfWeek: "Monday", startTime: "08:30", endTime: "09:30" });
});

test("rejects bookings that cross campus dates or use sub-minute times", () => {
  assert.equal(getCampusTimeSlot(
    new Date("2026-10-26T23:30:00+02:00"),
    new Date("2026-10-27T00:30:00+02:00")
  ), null);
  assert.equal(getCampusTimeSlot(
    new Date("2026-10-26T08:30:01+02:00"),
    new Date("2026-10-26T09:30:00+02:00")
  ), null);
});

test("checks room and personal timetable overlap for bookings", () => {
  const slot = { dayOfWeek: "Monday", startTime: "08:30", endTime: "09:30" };
  const allocations = [
    { roomId: "room-a", dayOfWeek: "Monday", startTime: "09:00", endTime: "10:00" },
    { roomId: "room-b", dayOfWeek: "Monday", startTime: "08:00", endTime: "09:00", studentIds: ["student-a"] },
    { roomId: "room-c", dayOfWeek: "Tuesday", startTime: "08:00", endTime: "10:00", studentIds: ["student-a"] },
  ];

  assert.equal(bookingConflictsWithTimetable(slot, "room-a", allocations), true);
  assert.equal(bookingConflictsWithTimetable(slot, "room-z", allocations, "student-a"), true);
  assert.equal(bookingConflictsWithTimetable(slot, "room-z", allocations, "student-b"), false);
});

test("identifies room and personal booking conflicts for cancellation on timetable publication", () => {
  const bookings = [{
    id: "booking-1",
    roomId: "room-a",
    userId: "student-a",
    startTime: new Date("2026-10-26T09:00:00+02:00"),
    endTime: new Date("2026-10-26T10:00:00+02:00"),
  }];

  assert.equal(timetableConflictsWithBookings(bookings, [
    { roomId: "room-a", dayOfWeek: "Monday", startTime: "09:30", endTime: "10:30" },
  ]), true);
  assert.equal(timetableConflictsWithBookings(bookings, [
    { roomId: "room-b", dayOfWeek: "Monday", startTime: "09:30", endTime: "10:30" },
  ]), false);
  assert.equal(timetableConflictsWithBookings(bookings, [
    { roomId: "room-b", dayOfWeek: "Monday", startTime: "09:30", endTime: "10:30", studentIds: ["student-a"] },
  ]), true);
  assert.deepEqual(findTimetableConflictingBookings(bookings, [
    { roomId: "room-b", dayOfWeek: "Monday", startTime: "09:30", endTime: "10:30", studentIds: ["student-a"] },
  ]).map((booking) => booking.id), ["booking-1"]);
});
