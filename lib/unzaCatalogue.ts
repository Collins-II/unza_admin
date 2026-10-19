export type UnzaCatalogue = {
  verifiedAt: string;
  scopeNote: string;
  departments: { code: string; name: string; faculty: string; sourceUrl: string }[];
  courses: { code: string; title: string; departmentCode: string; sourceUrl: string }[];
};

export function validateUnzaCatalogue(value: unknown): asserts value is UnzaCatalogue {
  if (!value || typeof value !== "object") throw new Error("Invalid UNZA catalogue.");
  const catalogue = value as Partial<UnzaCatalogue>;
  const official = (source: string) => {
    const url = new URL(source);
    return url.protocol === "https:" && (url.hostname === "unza.zm" || url.hostname.endsWith(".unza.zm"));
  };
  if (!catalogue.verifiedAt || !/^\d{4}-\d{2}-\d{2}$/.test(catalogue.verifiedAt) || !catalogue.scopeNote ||
      !Array.isArray(catalogue.departments) || !catalogue.departments.length || !Array.isArray(catalogue.courses)) {
    throw new Error("UNZA catalogue requires a verification date, scope and sourced departments/courses.");
  }
  const departments = new Set<string>();
  for (const department of catalogue.departments) {
    if (!department.code?.startsWith("UNZA-") || !department.name?.trim() || !department.faculty?.trim() ||
        !official(department.sourceUrl) || departments.has(department.code)) throw new Error("Invalid or duplicate sourced department.");
    departments.add(department.code);
  }
  const courses = new Set<string>();
  for (const course of catalogue.courses) {
    if (!course.code?.trim() || course.code !== course.code.toUpperCase().trim() || !course.title?.trim() ||
        !departments.has(course.departmentCode) || !official(course.sourceUrl) || courses.has(course.code)) {
      throw new Error("Invalid or duplicate sourced course.");
    }
    courses.add(course.code);
  }
}
