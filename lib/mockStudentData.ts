import { validateUnzaCatalogue } from "./unzaCatalogue.ts";
import type { StudentInput } from "./studentRegistration.ts";

export const MOCK_DATA_VERSION = "unza-departments-v2";
export const MOCK_STUDENT_COUNT = 1000;
export type MockStudent = StudentInput & { studentId: string; department: string; year: string; program: string };

export function createMockStudents(catalogue: unknown): MockStudent[] {
  validateUnzaCatalogue(catalogue);
  const departments = catalogue.departments;
  if (departments.length > MOCK_STUDENT_COUNT) throw new Error("The fixture requires at least one student per department.");
  const firstNames = ["Chanda", "Mutinta", "Mwila", "Thandiwe", "Bwalya", "Luyando", "Musonda", "Mwaka", "Chipo", "Mapalo"];
  const surnames = ["Banda", "Phiri", "Mwansa", "Tembo", "Zulu", "Mulenga", "Mbewe", "Sakala", "Lungu", "Chileshe"];
  const students: MockStudent[] = [];
  for (const [departmentIndex, department] of departments.entries()) {
    const count = Math.floor(MOCK_STUDENT_COUNT / departments.length) + (departmentIndex < MOCK_STUDENT_COUNT % departments.length ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      const year = String(index % 4 + 1);
      const number = String(index + 1).padStart(3, "0");
      students.push({
        name: `Mock ${department.code} Y${year} ${number} ${firstNames[index % firstNames.length]} ${surnames[Math.floor(index / firstNames.length) % surnames.length]}`,
        email: `mock.${department.code.toLowerCase()}.y${year}.${number}@example.test`,
        program: `Mock study cohort - ${department.name.replaceAll(",", ";")}`,
        year,
        department: department.code,
        studentId: String(202690001 + students.length),
      });
    }
  }
  return students;
}
