import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createMockStudents, MOCK_DATA_VERSION } from "../lib/mockStudentData.ts";
import { buildMockTimetable } from "../lib/mockTimetable.ts";

const outputDirectory = fileURLToPath(new URL("../fixtures/students/", import.meta.url));
const catalogue = JSON.parse(readFileSync(new URL("../fixtures/unza/catalogue.json", import.meta.url), "utf8"));
const students = createMockStudents(catalogue);
const columns = ["name", "email", "program", "year", "department", "studentId"];
const rows = students.map((student) => columns.map((column) => student[column]).join(","));

mkdirSync(outputDirectory, { recursive: true });
for (let offset = 0; offset < rows.length; offset += 100) {
  const batch = String(offset / 100 + 1).padStart(2, "0");
  const csv = ["name,email,program,year,department,studentId", ...rows.slice(offset, offset + 100)].join("\n") + "\n";
  writeFileSync(join(outputDirectory, `students-${batch}.csv`), csv, "utf8");
}
const plan = buildMockTimetable(students, catalogue);
const timetableDirectory = fileURLToPath(new URL("../fixtures/timetable/", import.meta.url));
mkdirSync(timetableDirectory, { recursive: true });
const csv = (values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
writeFileSync(join(timetableDirectory, "synthetic-courses.csv"), [
  csv(["code", "title", "departmentCode", "level", "expectedEnrollment", "sessionsPerWeek", "sessionMinutes", "credits", "dataKind"]),
  ...plan.courses.map((course) => csv([course.code, course.title, course.departmentCode, course.level, course.students.length, 2, 60, 3, "synthetic-test-only"])),
].join("\n") + "\n", "utf8");
writeFileSync(join(timetableDirectory, "synthetic-enrolments.csv"), [
  "studentId,courseCode",
  ...plan.courses.flatMap((course) => course.students.map((student) => `${student.studentId},${course.code}`)),
].join("\n") + "\n", "utf8");
writeFileSync(join(timetableDirectory, "manifest.json"), JSON.stringify({
  version: MOCK_DATA_VERSION,
  purpose: "Synthetic scheduling tests only; not an official UNZA course catalogue or student roster.",
  departmentSource: "../unza/catalogue.json",
  verifiedDepartmentDate: catalogue.verifiedAt,
  students: students.length,
  departments: plan.departments.length,
  schools: new Set(plan.departments.map((department) => department.faculty)).size,
  courses: plan.courses.length,
  enrolmentLinks: plan.courses.reduce((count, course) => count + course.students.length, 0),
  testRooms: plan.rooms.length,
  testAssumptions: { credits: 3, sessionsPerWeek: 2, sessionMinutes: 60, roomCapacity: 50, studyYears: [1, 2, 3, 4] },
  departmentsAndCohorts: plan.departments.map((department) => {
    const cohort = students.filter((student) => student.department === department.code);
    return { ...department, count: cohort.length, firstStudentId: cohort[0].studentId, lastStudentId: cohort[cohort.length - 1].studentId };
  }),
}, null, 2) + "\n", "utf8");
console.log(`Generated ${MOCK_DATA_VERSION}: ${rows.length} fictional students across ${catalogue.departments.length} verified UNZA departments in 10 batches at ${outputDirectory}. No database was changed.`);
