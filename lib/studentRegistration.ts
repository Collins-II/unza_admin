import { randomInt } from "node:crypto";

export const STUDENT_ID_PATTERN = /^\d{8,10}$/;
export const MAX_BULK_STUDENTS = 100;
export const MIN_STUDENT_PASSWORD_LENGTH = 10;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StudentInput = {
  name: string;
  email: string;
  studentId?: string;
  program?: string;
  year?: string;
  department?: string;
  phone?: string;
};

export function generateTemporaryPassword(length = 12) {
  let password = "";
  for (let index = 0; index < length; index += 1) password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return password;
}

export function formatStudentId(year: number, sequence: number) {
  return `${year}${String(sequence).padStart(5, "0")}`;
}

const text = (value: unknown, max = 120) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Returns a cleaned student record or a message describing why the record is unacceptable. */
export function normalizeStudentInput(raw: unknown): { value: StudentInput } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "A student record is required." };
  const record = raw as Record<string, unknown>;
  const name = text(record.name);
  const email = text(record.email, 160).toLowerCase();
  const studentId = text(record.studentId, 16);
  const year = text(record.year, 2);
  if (name.length < 2) return { error: "Student name is required." };
  if (!EMAIL_PATTERN.test(email)) return { error: `A valid email address is required for ${name}.` };
  if (studentId && !STUDENT_ID_PATTERN.test(studentId)) return { error: `Student ID ${studentId} must contain 8-10 digits.` };
  if (year && !/^[1-9]$/.test(year)) return { error: `Year of study for ${name} must be a single digit from 1 to 9.` };
  return {
    value: {
      name,
      email,
      ...(studentId ? { studentId } : {}),
      program: text(record.program),
      year,
      department: text(record.department),
      phone: text(record.phone, 32),
    },
  };
}

/** Parses pasted CSV with the header: name,email,program,year,department[,studentId] */
export function parseStudentCsv(csv: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { records: [] as Record<string, string>[], error: "" };
  const header = lines[0].toLowerCase().split(",").map((cell) => cell.trim());
  const hasHeader = header.includes("name") && header.includes("email");
  const columns = hasHeader ? header : ["name", "email", "program", "year", "department", "studentid"];
  const rows = hasHeader ? lines.slice(1) : lines;
  if (rows.length > MAX_BULK_STUDENTS) return { records: [], error: `Import at most ${MAX_BULK_STUDENTS} students at a time.` };
  const records = rows.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const entry: Record<string, string> = {};
    columns.forEach((column, index) => {
      entry[column === "studentid" ? "studentId" : column] = cells[index] || "";
    });
    return entry;
  });
  return { records, error: "" };
}
