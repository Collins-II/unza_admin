import AcademicTerm from "@/lib/database/models/AcademicTerm";
import { termContainsTeachingDate } from "@/lib/academicCalendar";

type TermTeaching = { academicYear?: string; semester?: string };

export async function teachingOnDate<T extends TermTeaching>(allocations: T[], date: string): Promise<T[]> {
  if (!allocations.length) return allocations;
  const terms = await AcademicTerm.find({ status: "approved", $or: allocations.map((row) => ({
    academicYear: row.academicYear || "", semester: row.semester || "",
  })) }).select("academicYear semester teachingStartDate teachingEndDate").lean();
  const byTerm = new Map(terms.map((term) => [`${term.academicYear}|${term.semester}`, term]));
  return allocations.filter((row) => {
    const term = byTerm.get(`${row.academicYear}|${row.semester}`);
    return !term || termContainsTeachingDate(term, date);
  });
}

export function campusDateString(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lusaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
