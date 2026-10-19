import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateUnzaCatalogue } from "../lib/unzaCatalogue.ts";

test("UNZA catalogue has unique course codes, valid department links and official sources", () => {
  const catalogue: unknown = JSON.parse(readFileSync(new URL("../fixtures/unza/catalogue.json", import.meta.url), "utf8"));
  validateUnzaCatalogue(catalogue);
  assert.ok(catalogue.departments.length > 0);
  assert.ok(Array.isArray(catalogue.courses));
});

test("catalogue rejects unsourced, duplicate and orphan course facts", () => {
  const valid = {
    verifiedAt: "2026-10-19", scopeNote: "Test",
    departments: [{ code: "UNZA-CS", name: "Computer Science", faculty: "Test school", sourceUrl: "https://www.unza.zm/test" }],
    courses: [{ code: "CSC 1000", title: "Test course", departmentCode: "UNZA-CS", sourceUrl: "https://www.unza.zm/test" }],
  };
  assert.doesNotThrow(() => validateUnzaCatalogue(valid));
  assert.doesNotThrow(() => validateUnzaCatalogue({ ...valid, courses: [], scopeNote: "No public course catalogue could be verified." }));
  assert.throws(() => validateUnzaCatalogue({ ...valid, courses: [...valid.courses, ...valid.courses] }), /duplicate/);
  assert.throws(() => validateUnzaCatalogue({ ...valid, courses: [{ ...valid.courses[0], sourceUrl: "https://unza.zm.example.com/test" }] }), /sourced/);
  assert.throws(() => validateUnzaCatalogue({ ...valid, courses: [{ ...valid.courses[0], departmentCode: "UNZA-UNKNOWN" }] }), /sourced/);
});
