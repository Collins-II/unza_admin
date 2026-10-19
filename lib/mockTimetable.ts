import { createMockStudents, MOCK_DATA_VERSION, MOCK_STUDENT_COUNT, type MockStudent } from "./mockStudentData.ts";
import { validateUnzaCatalogue } from "./unzaCatalogue.ts";

export function buildMockTimetable(records: Record<string, string>[], catalogue: unknown) {
  validateUnzaCatalogue(catalogue);
  const students = createMockStudents(catalogue);
  if (records.length !== MOCK_STUDENT_COUNT) throw new Error(`The demo requires all ${MOCK_STUDENT_COUNT} student fixtures.`);
  for (const [index, expected] of students.entries()) {
    if (Object.entries(expected).some(([key, value]) => records[index][key] !== value)) {
      throw new Error(`Unexpected demo student at row ${index + 1}. Run npm run mock:students for ${MOCK_DATA_VERSION}.`);
    }
  }
  const rooms = Array.from({ length: 16 }, (_, index) => ({
    code: `MOCK-UNZA-ROOM-${index + 1}`,
    name: `Mock UNZA teaching room ${index + 1}`,
    capacity: 50,
    latitude: -15.392 + index * 0.00005,
    longitude: 28.329,
  }));
  const courses: { code: string; title: string; departmentCode: string; level: string; students: MockStudent[] }[] = [];
  for (const department of catalogue.departments) {
    const roster = students.filter((student) => student.department === department.code);
    for (let subject = 1; subject <= 2; subject += 1) {
      courses.push({
        code: `MOCK-${department.code}-T${subject}`,
        title: `Synthetic test ${subject} - ${department.name}`,
        departmentCode: department.code,
        level: "Synthetic mixed-year test",
        students: roster,
      });
    }
  }
  const schools = [...new Set(catalogue.departments.map((department) => department.faculty))];
  for (const school of schools) {
    const departments = catalogue.departments.filter((department) => department.faculty === school);
    const departmentCodes = new Set(departments.map((department) => department.code));
    const anchor = departments[0];
    courses.push({
      code: `MOCK-${anchor.code}-SHARED`,
      title: `Synthetic shared test - ${school}`,
      departmentCode: anchor.code,
      level: "Synthetic shared test",
      students: students.filter((student) => departmentCodes.has(student.department)),
    });
  }
  return { version: MOCK_DATA_VERSION, verifiedAt: catalogue.verifiedAt, students, departments: catalogue.departments, rooms, courses };
}
