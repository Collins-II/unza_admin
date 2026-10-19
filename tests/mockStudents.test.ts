import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { MAX_BULK_STUDENTS, normalizeStudentInput, parseStudentCsv } from "../lib/studentRegistration.ts";
import { createMockStudents } from "../lib/mockStudentData.ts";
import { buildMockTimetable } from "../lib/mockTimetable.ts";
import { generateTimetable } from "../lib/timetableGenerator.ts";
import { validateTimetableForPublishing } from "../lib/timetableValidation.ts";
import { validateUnzaCatalogue } from "../lib/unzaCatalogue.ts";

const catalogue: unknown = JSON.parse(readFileSync(new URL("../fixtures/unza/catalogue.json", import.meta.url), "utf8"));
validateUnzaCatalogue(catalogue);
const directory = new URL("../fixtures/students/", import.meta.url);
const files = Array.from({ length: 10 }, (_, index) => `students-${String(index + 1).padStart(2, "0")}.csv`);
const records = files.flatMap((file) => {
  const parsed = parseStudentCsv(readFileSync(new URL(file, directory), "utf8"));
  assert.equal(parsed.error, "", file);
  assert.equal(parsed.records.length, 100, file);
  assert.ok(parsed.records.length <= MAX_BULK_STUDENTS, file);
  return parsed.records;
});

test("ten import batches contain 1000 valid unique students and match the deterministic generator", () => {
  assert.deepEqual(readdirSync(directory).filter((file) => file.endsWith(".csv")).sort(), files);
  assert.equal(records.length, 1000);
  assert.equal(new Set(records.map((record) => record.studentId)).size, 1000);
  assert.equal(new Set(records.map((record) => record.email)).size, 1000);
  assert.equal(new Set(records.map((record) => record.name)).size, 1000);
  assert.deepEqual(records, createMockStudents(catalogue));
  for (const [index, record] of records.entries()) {
    const normalized = normalizeStudentInput(record);
    assert.ok("value" in normalized, `Invalid mock student at row ${index + 1}`);
    for (const [key, value] of Object.entries(record)) assert.equal(normalized.value[key as keyof typeof normalized.value], value);
    assert.equal(record.studentId, String(202690001 + index));
    assert.match(record.email, /^mock\.unza-[a-z-]+\.y[1-4]\.\d{3}@example\.test$/);
    assert.match(record.program, /^Mock study cohort - /);
  }
});

test("students cover every verified UNZA department and all 12 schools with balanced study years", () => {
  assert.equal(catalogue.departments.length, 65);
  assert.equal(new Set(catalogue.departments.map((department) => department.faculty)).size, 12);
  assert.equal(new Set(records.map((student) => student.department)).size, 65);
  for (const department of catalogue.departments) {
    const cohort = records.filter((student) => student.department === department.code);
    assert.ok([15, 16].includes(cohort.length), department.code);
    assert.deepEqual([...new Set(cohort.map((student) => student.year))].sort(), ["1", "2", "3", "4"]);
    for (const student of cohort) {
      assert.ok(student.name.startsWith(`Mock ${department.code} `));
      assert.equal(student.program, `Mock study cohort - ${department.name.replaceAll(",", ";")}`);
    }
  }
  assert.equal(records.filter((student) => student.year === "1").length, 260);
  assert.equal(records.filter((student) => student.year === "4").length, 220);
});

test("synthetic courses are linked only to verified departments and cover all students three times", () => {
  const plan = buildMockTimetable(records, catalogue);
  assert.equal(plan.departments.length, 65);
  assert.equal(plan.rooms.length, 16);
  assert.equal(plan.courses.length, 142);
  assert.equal(plan.courses.reduce((count, course) => count + course.students.length, 0), 3000);
  const departmentCodes = new Set(catalogue.departments.map((department) => department.code));
  for (const course of plan.courses) {
    assert.ok(course.code.startsWith("MOCK-UNZA-"));
    assert.ok(course.title.startsWith("Synthetic "));
    assert.ok(departmentCodes.has(course.departmentCode));
  }
  for (const student of plan.students) {
    assert.equal(plan.courses.filter((course) => course.students.some((member) => member.studentId === student.studentId)).length, 3);
  }
  const manifest = JSON.parse(readFileSync(new URL("../fixtures/timetable/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, plan.version);
  assert.equal(manifest.students, 1000);
  assert.equal(manifest.courses, 142);
  assert.equal(manifest.enrolmentLinks, 3000);
  assert.equal(manifest.departmentsAndCohorts.length, 65);
  const enrolments = readFileSync(new URL("../fixtures/timetable/synthetic-enrolments.csv", import.meta.url), "utf8").trim().split("\n");
  assert.deepEqual(enrolments, ["studentId,courseCode", ...plan.courses.flatMap((course) => course.students.map((student) => `${student.studentId},${course.code}`))]);
  const csv = (values: (string | number)[]) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
  assert.deepEqual(readFileSync(new URL("../fixtures/timetable/synthetic-courses.csv", import.meta.url), "utf8").trim().split("\n"), [
    csv(["code", "title", "departmentCode", "level", "expectedEnrollment", "sessionsPerWeek", "sessionMinutes", "credits", "dataKind"]),
    ...plan.courses.map((course) => csv([course.code, course.title, course.departmentCode, course.level, course.students.length, 2, 60, 3, "synthetic-test-only"])),
  ]);
});

test("all-department mock rosters produce a complete capacity-safe publishable timetable", { timeout: 120000 }, () => {
  const plan = buildMockTimetable(records, catalogue);
  const rooms = plan.rooms.map((room) => ({ ...room, id: room.code, available: true, spaceType: "lecture_room" }));
  const courses = plan.courses.map((course) => ({
    id: course.code, code: course.code, title: course.title, departmentCode: course.departmentCode,
    level: course.level, expectedEnrollment: course.students.length, lecturer: `Demo lecturer ${course.code}`,
    sessionsPerWeek: 2, sessionMinutes: 60, venueIds: rooms.map((room) => room.id),
    preferredSpaceTypes: ["lecture_room"], studentIds: course.students.map((student) => student.studentId),
  }));
  const result = generateTimetable(courses, rooms, []);
  assert.deepEqual(result.unscheduled, []);
  assert.equal(result.stats.courses, 142);
  assert.ok(result.stats.splitCourses > 0);
  const expectedSessions = courses.reduce((sum, course) => sum + Math.ceil(course.studentIds.length / 50) * 2, 0);
  assert.equal(result.sessions.length, expectedSessions);
  assert.deepEqual(validateTimetableForPublishing(
    courses.map((course) => ({ ...course, preferredVenues: course.venueIds })),
    result.sessions.map((session, index) => ({ ...session, id: String(index), cohort: session.group, lecturer: session.lecturer || "" })),
    rooms, new Map(courses.map((course) => [course.id, course.studentIds]))
  ), []);
});

test("setup rejects incomplete, tampered and legacy mock datasets", () => {
  assert.throws(() => buildMockTimetable(records.slice(1), catalogue), /1000/);
  const changes: Record<string, string>[] = [{ studentId: "12345678" }, { year: "9" }, { department: "CS" }, { email: "mock.cs.y1.001@example.test" }, { program: "Unverified degree" }];
  for (const change of changes) {
    assert.throws(() => buildMockTimetable(records.map((record, index) => index === 0 ? { ...record, ...change } : record), catalogue), /Unexpected demo student/);
  }
});
