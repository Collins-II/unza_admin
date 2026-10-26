import assert from "node:assert/strict";
import test from "node:test";
import { canAccessDepartment, validateDepartmentAssignments } from "../lib/departmentAccess.ts";
import { independentReviewer } from "../lib/publicationPolicy.ts";

const first = "0123456789abcdef01234567", second = "1123456789abcdef01234567";
test("department access is explicit and fails closed for unassigned and student accounts", () => {
  assert.equal(canAccessDepartment({ role: "admin" }, second), true);
  assert.equal(canAccessDepartment({ role: "staff" }, first), false);
  assert.equal(canAccessDepartment({ role: "staff", departmentIds: [first] }, first), true);
  assert.equal(canAccessDepartment({ role: "staff", departmentIds: [first] }, second), false);
  assert.equal(canAccessDepartment({ role: "student", departmentIds: [first] }, first), false);
});
test("department assignments reject query objects, duplicates, malformed IDs and oversized lists", () => {
  assert.equal(validateDepartmentAssignments([]), true);
  assert.equal(validateDepartmentAssignments([first, second]), true);
  assert.equal(validateDepartmentAssignments([first, first.toUpperCase()]), false);
  assert.equal(validateDepartmentAssignments([{ $ne: null }]), false);
  assert.equal(validateDepartmentAssignments(["Economics"]), false);
  assert.equal(validateDepartmentAssignments(Array(101).fill(first)), false);
});
test("publication reviewers must differ from both submitter and every recorded creator", () => {
  assert.equal(independentReviewer(first, first, []), false);
  assert.equal(independentReviewer(first, second, [first]), false);
  assert.equal(independentReviewer(second, first, [first]), true);
});
