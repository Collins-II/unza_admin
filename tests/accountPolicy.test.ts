import assert from "node:assert/strict";
import test from "node:test";
import { isActiveStaff, removesLastAdministrator } from "../lib/accountPolicy.ts";
import { failedLoginUpdate } from "../lib/loginAttempts.ts";

test("only current active staff and administrator accounts are authorized", () => {
  for (const role of ["staff", "admin"]) {
    assert.equal(isActiveStaff({ role, status: "active" }), true);
    for (const status of ["inactive", "pending", undefined]) assert.equal(isActiveStaff({ role, status }), false);
  }
  assert.equal(isActiveStaff({ role: "student", status: "active" }), false);
  assert.equal(isActiveStaff(null), false);
});

test("last active administrator cannot be deactivated or demoted", () => {
  const current = { role: "admin", status: "active" };
  assert.equal(removesLastAdministrator(current, { status: "inactive" }, 1), true);
  assert.equal(removesLastAdministrator(current, { role: "staff" }, 1), true);
  assert.equal(removesLastAdministrator(current, { status: "active" }, 1), false);
  assert.equal(removesLastAdministrator(current, { status: "inactive" }, 2), false);
  assert.equal(removesLastAdministrator({ role: "student", status: "active" }, { status: "inactive" }, 1), false);
});

test("failed login counters use a single atomic pipeline with a 15-minute lockout", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const update = failedLoginUpdate(now)[0].$set;
  assert.deepEqual(update.failedLoginAttempts.$cond[0], {
    $gte: [{ $add: [{ $ifNull: ["$failedLoginAttempts", 0] }, 1] }, 5],
  });
  assert.equal((update.lockedUntil.$cond[1] as Date).getTime(), now.getTime() + 15 * 60_000);
});
