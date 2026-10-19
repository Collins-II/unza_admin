export type DataResource = "students" | "departments" | "courses" | "rooms" | "accounts" | "allocations" | "announcements";
type Register = {
  title: string; collection: string; search: string[]; columns: { key: string; label: string }[];
  sorts: string[]; defaultSort: string; statuses: string[]; filters: { key: string; label: string }[];
};
export const adminRegisters: Record<DataResource, Register> = {
  students: {
    title: "Students", collection: "users", search: ["name", "studentId", "email", "program", "department"],
    columns: [{ key: "studentId", label: "Student ID" }, { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "department", label: "Department" }, { key: "year", label: "Year" }, { key: "status", label: "Status" }],
    sorts: ["studentId", "name", "email", "department", "year", "status", "createdAt"], defaultSort: "studentId",
    statuses: ["active", "inactive", "pending"], filters: [{ key: "department", label: "Department code" }, { key: "year", label: "Study year" }],
  },
  departments: {
    title: "Departments", collection: "departments", search: ["code", "name", "faculty", "headOfDepartment"],
    columns: [{ key: "code", label: "Code" }, { key: "name", label: "Department" }, { key: "faculty", label: "School / faculty" }, { key: "active", label: "Active" }],
    sorts: ["code", "name", "faculty", "active"], defaultSort: "code", statuses: ["active", "inactive"],
    filters: [{ key: "faculty", label: "School / faculty" }],
  },
  courses: {
    title: "Courses", collection: "courses", search: ["code", "title", "lecturer"],
    columns: [{ key: "code", label: "Code" }, { key: "title", label: "Course" }, { key: "department.code", label: "Department" }, { key: "semester", label: "Semester" }, { key: "expectedEnrollment", label: "Expected" }, { key: "active", label: "Active" }],
    sorts: ["code", "title", "semester", "expectedEnrollment", "active"], defaultSort: "code", statuses: ["active", "inactive", "catalogue"],
    filters: [{ key: "department", label: "Department" }, { key: "semester", label: "Semester" }],
  },
  rooms: {
    title: "Campus locations", collection: "rooms", search: ["code", "name", "building"],
    columns: [{ key: "code", label: "Code" }, { key: "name", label: "Location" }, { key: "building", label: "Building" }, { key: "spaceType", label: "Type" }, { key: "capacity", label: "Seats" }, { key: "isAvailable", label: "Available" }],
    sorts: ["code", "name", "building", "spaceType", "capacity", "isAvailable"], defaultSort: "code", statuses: ["available", "offline"],
    filters: [{ key: "building", label: "Building" }, { key: "spaceType", label: "Space type" }],
  },
  accounts: {
    title: "Staff accounts", collection: "users", search: ["name", "studentId", "email", "department"],
    columns: [{ key: "name", label: "Name" }, { key: "studentId", label: "Staff ID" }, { key: "email", label: "Email" }, { key: "department", label: "Unit" }, { key: "role", label: "Role" }, { key: "status", label: "Status" }],
    sorts: ["name", "studentId", "email", "role", "status", "createdAt"], defaultSort: "name", statuses: ["active", "inactive", "pending"],
    filters: [{ key: "role", label: "Role" }, { key: "department", label: "Department / unit" }],
  },
  allocations: {
    title: "Class allocations", collection: "timetableallocations", search: ["cohort", "lecturer", "stream", "notes"],
    columns: [{ key: "course.code", label: "Course" }, { key: "dayOfWeek", label: "Day" }, { key: "startTime", label: "Start" }, { key: "endTime", label: "End" }, { key: "room.code", label: "Room" }, { key: "cohort", label: "Cohort" }, { key: "status", label: "Status" }],
    sorts: ["dayOfWeek", "startTime", "status", "cohort"], defaultSort: "dayOfWeek", statuses: ["draft", "published", "cancelled"],
    filters: [{ key: "department", label: "Department" }, { key: "dayOfWeek", label: "Day" }, { key: "academicYear", label: "Academic year" }, { key: "semester", label: "Semester" }],
  },
  announcements: {
    title: "Announcements", collection: "announcements", search: ["title", "message"],
    columns: [{ key: "title", label: "Title" }, { key: "audience", label: "Audience" }, { key: "priority", label: "Priority" }, { key: "createdAt", label: "Published" }],
    sorts: ["title", "audience", "priority", "createdAt"], defaultSort: "createdAt", statuses: [],
    filters: [{ key: "audience", label: "Audience" }, { key: "priority", label: "Priority" }],
  },
};
export class DataQueryError extends Error {}
export const MAX_EXPORT_ROWS = 10000;
export const adminFilterOptions: Record<string, string[]> = {
  year: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  semester: ["Semester 1", "Semester 2", "Summer"],
  dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  role: ["staff", "admin"],
  spaceType: ["lecture_room", "laboratory", "seminar_room", "office", "administrative", "library", "clinic", "cafeteria", "residence", "other"],
  audience: ["all", "students", "staff"],
  priority: ["low", "normal", "high", "urgent"],
};
export const escapeSearch = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseDataQuery(params: URLSearchParams) {
  const resource = params.get("resource");
  if (!resource || !Object.hasOwn(adminRegisters, resource)) throw new DataQueryError("Unknown data register.");
  const key = resource as DataResource;
  const register = adminRegisters[key];
  const integer = (name: string, fallback: number, max: number) => {
    const raw = params.get(name);
    const value = raw === null ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < 0 || value > max || raw === "") throw new DataQueryError(`Invalid ${name}.`);
    return value;
  };
  const page = integer("page", 0, 1000000);
  const limit = integer("limit", 25, 100);
  if (![10, 25, 50, 100].includes(limit)) throw new DataQueryError("Page size must be 10, 25, 50 or 100.");
  const search = (params.get("search") || "").trim();
  if (search.length > 100) throw new DataQueryError("Search is limited to 100 characters.");
  const sort = params.get("sort") || register.defaultSort;
  if (!register.sorts.includes(sort)) throw new DataQueryError("Invalid sort field.");
  const direction = params.get("direction") || (key === "announcements" ? "desc" : "asc");
  if (!["asc", "desc"].includes(direction)) throw new DataQueryError("Invalid sort direction.");
  const status = params.get("status") || "";
  if (status && !register.statuses.includes(status)) throw new DataQueryError("Invalid status filter.");
  const filters: Record<string, string> = {};
  for (const { key: field } of register.filters) {
    const value = (params.get(field) || "").trim();
    if (value.length > 120) throw new DataQueryError(`${field} is limited to 120 characters.`);
    if (field === "role" && value && !["staff", "admin"].includes(value)) throw new DataQueryError("Invalid staff role.");
    if (field === "year" && value && !/^[1-9]$/.test(value)) throw new DataQueryError("Invalid study year.");
    if (value) filters[field] = value;
  }
  const id = params.get("id") || "";
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  if (ids.length > 100 || [id, ...ids].some((value) => value && !/^[a-f\d]{24}$/i.test(value))) throw new DataQueryError("Invalid record IDs.");
  return { resource: key, register, page, limit, search, sort, direction: direction === "asc" ? 1 as const : -1 as const, status, filters, id, ids };
}

export function cellValue(record: unknown, path: string): string {
  let value = record;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !(key in value)) return "";
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function csvCell(value: string) {
  // Quoting alone does not stop spreadsheet formula execution.
  const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
