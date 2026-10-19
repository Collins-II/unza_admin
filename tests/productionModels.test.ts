import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import TimetableAllocation from "../lib/database/models/TimetableAllocation.ts";
import Course from "../lib/database/models/Course.ts";

test("allocation dependencies register on first module import without another endpoint warming them", () => {
  assert.ok(TimetableAllocation);
  for (const name of ["Department", "Course", "Room", "User"]) assert.ok(mongoose.models[name], name);
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
