import assert from "node:assert/strict";
import test from "node:test";
import { adminRegisters, cellValue, csvCell, DataQueryError, escapeSearch, normalizeStudentRegisterRecord, parseDataQuery } from "../lib/adminData.ts";

test("legacy student register records receive enrolment and password-state defaults without modifying stored data", () => {
  for (const fields of [{}, { enrolledCourses: null }, { enrolledCourses: [] }]) {
    const record = { _id: "student-id", name: "Student", ...fields };
    const original = { ...record };
    const normalized = normalizeStudentRegisterRecord(record);
    assert.deepEqual(normalized.enrolledCourses, []);
    assert.equal(normalized.enrolledCourses.length, 0);
    assert.equal(normalized.mustChangePassword, false);
    assert.equal(normalized.name, record.name);
    assert.deepEqual(record, original);
  }
});

test("student register preserves enrolment IDs and password state and reports malformed enrolments", () => {
  const id = "0123456789abcdef01234567";
  const enrolledCourses = [id, { toString: () => "abcdef0123456789abcdef01" }];
  const normalized = normalizeStudentRegisterRecord({ enrolledCourses, mustChangePassword: true });
  assert.deepEqual(normalized.enrolledCourses, [id, "abcdef0123456789abcdef01"]);
  assert.equal(normalized.mustChangePassword, true);
  assert.equal(enrolledCourses.length, 2);
  for (const invalid of ["invalid", 1, {}]) {
    assert.throws(() => normalizeStudentRegisterRecord({ enrolledCourses: invalid }), /enrolments must be an array/);
  }
});

test("all seven admin registers have bounded stable paging and whitelisted sorting", () => {
  assert.equal(Object.keys(adminRegisters).length, 7);
  for (const resource of Object.keys(adminRegisters)) {
    const query = parseDataQuery(new URLSearchParams({ resource }));
    assert.equal(query.limit, 25);
    assert.equal(query.page, 0);
    assert.ok(query.register.sorts.includes(query.sort));
    assert.ok(query.register.columns.length > 0);
  }
  for (const [field, value] of [["resource", "__proto__"], ["resource", "secrets"], ["limit", "1000"], ["limit", "0"], ["limit", "NaN"], ["limit", "1.5"], ["limit", ""], ["page", "-1"], ["page", "Infinity"], ["sort", "$where"], ["direction", "sideways"], ["status", "unknown"], ["id", "not-an-id"]]) {
    assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "students", [field]: value })), DataQueryError, `${field}=${value}`);
  }
});
test("search and filters are bounded and Mongo search patterns remain literal", () => {
  const query = parseDataQuery(new URLSearchParams({ resource: "students", search: "  .* [student]  ", department: "UNZA-TEST", year: "2", password: "secret", page: "4", limit: "50", sort: "name", direction: "desc" }));
  assert.equal(query.search, ".* [student]");
  assert.equal(escapeSearch(query.search), "\\.\\* \\[student\\]");
  assert.deepEqual(query.filters, { department: "UNZA-TEST", year: "2" });
  assert.equal(query.direction, -1);
  assert.equal(query.page, 4);
  assert.equal(query.limit, 50);
  assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "students", search: "x".repeat(101) })), DataQueryError);
  assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "departments", faculty: "x".repeat(121) })), DataQueryError);
  assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "accounts", role: "student" })), DataQueryError);
  assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "students", year: "12" })), DataQueryError);
});
test("CSV export quotes multiline cells and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('Course, "A"'), '"Course, ""A"""');
  assert.equal(csvCell("Line one\nLine two"), '"Line one\nLine two"');
  for (const formula of ["=SUM(1,2)", "+123", "-123", "@command", "  =SUM(1,2)", "\tformula", "\rformula", "\nformula"]) assert.ok(csvCell(formula).startsWith(`"'`));
  assert.equal(csvCell("UNZA-TEST"), '"UNZA-TEST"');
  assert.equal(cellValue({ department: { code: "UNZA-TEST" }, count: 0, active: false }, "department.code"), "UNZA-TEST");
  assert.equal(cellValue({ active: false }, "active"), "No");
  assert.equal(cellValue({ count: 0 }, "count"), "0");
  assert.equal(cellValue({}, "department.code"), "");
  assert.equal(cellValue({ createdAt: new Date("2026-10-19T00:00:00Z") }, "createdAt"), "2026-10-19T00:00:00.000Z");
  assert.equal(cellValue({ password: { secret: 1 } }, "password"), "");
});
test("selection export validates every ID and bounds selected rows to a page", () => {
  const id = "0123456789abcdef01234567";
  assert.deepEqual(parseDataQuery(new URLSearchParams({ resource: "courses", ids: `${id},${id}` })).ids, [id, id]);
  assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "courses", ids: `${id},malformed` })), DataQueryError);
  assert.throws(() => parseDataQuery(new URLSearchParams({ resource: "courses", ids: Array(101).fill(id).join(",") })), DataQueryError);
});
