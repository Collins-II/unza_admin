import assert from "node:assert/strict";
import test from "node:test";

import { formatStudentId, generateTemporaryPassword, MAX_BULK_STUDENTS, normalizeStudentInput, parseStudentCsv } from "../lib/studentRegistration.ts";

test("normalizes valid student records and rejects malformed ones", () => {
  const ok = normalizeStudentInput({ name: " Jane Banda ", email: "Jane@Example.com", year: "2", studentId: "202600001" });
  assert.ok("value" in ok);
  if ("value" in ok) {
    assert.equal(ok.value.email, "jane@example.com");
    assert.equal(ok.value.name, "Jane Banda");
    assert.equal(ok.value.studentId, "202600001");
  }
  for (const bad of [{ name: "J", email: "a@b.co" }, { name: "Jane", email: "nope" }, { name: "Jane", email: "a@b.co", studentId: "ABC123" }, { name: "Jane", email: "a@b.co", year: "12" }, null]) {
    assert.ok("error" in normalizeStudentInput(bad));
  }
});

test("formats generated student IDs and temporary passwords", () => {
  assert.equal(formatStudentId(2026, 7), "202600007");
  const first = generateTemporaryPassword();
  assert.equal(first.length, 12);
  assert.match(first, /^[A-Za-z0-9]+$/);
  assert.notEqual(first, generateTemporaryPassword());
});

test("parses headed and headerless student CSV and enforces batch size", () => {
  const headed = parseStudentCsv("name,email,program,year\r\nJane,jane@x.zm,BSc,1\n");
  assert.equal(headed.records.length, 1);
  assert.equal(headed.records[0].program, "BSc");
  const headerless = parseStudentCsv("Jane,jane@x.zm,BSc,1,CS,202600001");
  assert.equal(headerless.records[0].studentId, "202600001");
  const tooMany = parseStudentCsv(Array.from({ length: MAX_BULK_STUDENTS + 1 }, (_, i) => `S${i},s${i}@x.zm`).join("\n"));
  assert.ok(tooMany.error);
});
