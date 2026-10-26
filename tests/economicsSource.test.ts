import assert from "node:assert/strict";
import test from "node:test";
import { economicsCourses, economicsSlots, parseEconomicsEntry } from "../lib/economicsSource.ts";

test("Economics roster preserves all 34 distinct sourced courses and missing requirements", () => {
  assert.equal(economicsCourses.length, 34);
  assert.equal(new Set(economicsCourses.map((course) => course.code)).size, 34);
  assert.equal(economicsCourses.find((course) => course.code === "BBA1110")?.desiredStreams, 4);
  assert.equal(economicsCourses.find((course) => course.code === "BBA1110")?.allocatedSlots, 6);
  assert.equal(economicsCourses.find((course) => course.code === "ECN4411")?.allocatedSlots, undefined);
  assert.equal(economicsCourses.find((course) => course.code === "ECN5604")?.allocatedSlots, undefined);
});

test("Source parsing does not silently fix ambiguous codes or cross-listing", () => {
  for (const raw of ["LT1 ECN311", "G7 ECN4153", "TLC2 BB2311", "TLC1 ECN4411/BB4414", "LAW 3", "LT1 BBA3415"]) {
    assert.equal(parseEconomicsEntry(raw).courseCode, null, raw);
    assert.ok(parseEconomicsEntry(raw).issues.length, raw);
  }
  assert.deepEqual(parseEconomicsEntry("DLT BBA1110 (A)"), { roomCode: "DLT", courseCode: "BBA1110", stream: "A", issues: [] });
});

test("Draft 5 evidence has stable unique row IDs and valid one-hour source slots", () => {
  assert.ok(economicsSlots.length > 100);
  assert.equal(new Set(economicsSlots.map((slot) => slot.id)).size, economicsSlots.length);
  assert.ok(economicsSlots.every((slot) => Number(slot.endTime.slice(0, 2)) - Number(slot.startTime.slice(0, 2)) === 1));
  assert.ok(economicsSlots.some((slot) => slot.dayOfWeek === "Tuesday" && slot.startTime === "15:00" && slot.raw === "LT1 BBA3425"));
  assert.ok(economicsSlots.some((slot) => slot.issues.length > 0));
  assert.equal(economicsSlots.filter((slot) => slot.dayOfWeek === "Friday" && slot.startTime === "15:00").length, 0);
  assert.ok(economicsSlots.some((slot) => slot.dayOfWeek === "Friday" && slot.startTime === "18:00" && slot.raw === "LAW 3 BBA9115"));
});
