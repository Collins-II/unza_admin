import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import TimetableAllocation from "../lib/database/models/TimetableAllocation.ts";
import Course from "../lib/database/models/Course.ts";
import AssessmentAllocation from "../lib/database/models/AssessmentAllocation.ts";

test("allocation dependencies register on first module import without another endpoint warming them", () => {
  assert.ok(TimetableAllocation);
  for (const name of ["Department", "Course", "Room", "User"]) assert.ok(mongoose.models[name], name);
});

test("assessment model rejects impossible dates, reversed times and duplicate or empty assignments", async () => {
  const department = new mongoose.Types.ObjectId(), course = new mongoose.Types.ObjectId(), room = new mongoose.Types.ObjectId();
  const student = new mongoose.Types.ObjectId(), invigilator = new mongoose.Types.ObjectId();
  const input = {
    academicYear: "2025/2026", semester: "Semester 1", department, course, room,
    date: "2026-10-26", startTime: "09:00", endTime: "10:00", title: "Test", assessmentType: "test",
    studentIds: [student], invigilatorIds: [invigilator],
  };
  await assert.doesNotReject(() => new AssessmentAllocation(input).validate());
  for (const patch of [
    { date: "2026-02-30" }, { startTime: "11:00" }, { studentIds: [] },
    { studentIds: [student, student] }, { invigilatorIds: [] }, { invigilatorIds: [invigilator, invigilator] },
  ]) {
    await assert.rejects(() => new AssessmentAllocation({ ...input, ...patch }).validate(), { name: "ValidationError" });
  }
});

test("catalogue-only courses preserve missing scheduling data and cannot masquerade as active offerings", async () => {
  const catalogue = new Course({
    code: "CSC 9999", title: "Test catalogue entry", department: new mongoose.Types.ObjectId(),
    catalogueOnly: true, active: false, preferredSpaceTypes: [],
  });
  await assert.doesNotReject(() => catalogue.validate());
  for (const field of ["level", "credits", "semester", "expectedEnrollment", "sessionsPerWeek", "sessionMinutes"]) {
    assert.equal(catalogue.get(field), undefined, field);
  }
  catalogue.active = true;
  await assert.rejects(() => catalogue.validate(), /Catalogue-only courses cannot be active/);
  const active = new Course({ code: "TEST", title: "Test", department: new mongoose.Types.ObjectId() });
  await assert.rejects(() => active.validate(), { name: "ValidationError" });
  assert.equal(active.sessionsPerWeek, 2);
  assert.equal(active.sessionMinutes, 120);
});
