import { WEEKDAYS } from "./timetable.ts";

export const ECONOMICS_SOURCE_VERSION = "economics-2026-term-1-draft-5";
export const ECONOMICS_DEPARTMENT_CODE = "UNZA-HSS-ECON";
export const ECONOMICS_ACADEMIC_YEAR = "2025/2026";
export const ECONOMICS_SEMESTER = "Semester 1";
export const ECONOMICS_DOCUMENTS = [
  "Economics - Departmental Timetable - 2026 Term I - First Draft 2.pdf",
  "EDITED Economics - Departmental Timetable - 2026 Term I - First Draft 5.pdf",
] as const;

type SourceCourseRow = [code: string, title: string, level: string, lecturer: string, desiredStreams?: number, allocatedSlots?: number];
const courseRows: SourceCourseRow[] = [
  ["BBA1110", "Principles of Business Administration", "Year 1", "Phiri D/Nkhowani J", 4, 6],
  ["ECN1115", "Introductory Microeconomics Theory", "Year 1", "Simwinga L", 2, 4],
  ["ECN1215", "Introductory Macroeconomics Theory", "Year 1", "Simuchimba B", 2, 4],
  ["BBA2210", "Principles of Accounting", "Year 2", "Kaulu B", 2, 4],
  ["BBA2421", "Business Mathematics", "Year 2", "Chirwa J", 1, 2],
  ["BBA2311", "Principles of Marketing", "Year 2", "Kabwe S", 1, 3],
  ["ECN2115", "Intermediate Microeconomics Theory", "Year 2", "Ndulo M", 2, 4],
  ["ECN2215", "Intermediate Macroeconomics Theory", "Year 2", "Banda C", 2, 4],
  ["ECN2311", "Mathematics for Economics I", "Year 2", "Chompolola A", 2, 3],
  ["ECN2331", "Statistics: Theory and techniques for economics", "Year 2", "Ndhlovu O/Chirwa J", 2, 2],
  ["BBA3211", "Financial Management", "Year 3", "Mutambo B", 1, 2],
  ["BBA3235", "Taxation", "Year 3", "Mwale R", 1, 2],
  ["BBA3425", "Business Law", "Year 3", "Phiri C", 1, 3],
  ["ECN3115", "Advanced Microeconomic Theory", "Year 3", "Chikumbe S", 1, 2],
  ["ECN3311", "Econometrics I", "Year 3", "Musantu J", 1, 2],
  ["ECN3225", "Money and Banking", "Year 3", "Chikumbi L", 1, 3],
  ["BBA4122", "Organisational Behaviour", "Year 4", "Siakalima D", 1, 2],
  ["BBA4414", "Business Research Methodology and Practice", "Year 4", "Tounkara M", 1, 3],
  ["ECN4411", "Research Methodology and Practice", "Year 4", "Tounkara M", 1],
  ["ECN4121", "International Trade Theory and Practice", "Year 4", "Chipili J", 1, 3],
  ["ECN4135", "Labour Economics", "Year 4", "Maboshe M", 1, 2],
  ["ECN4145", "Environmental Economics", "Year 4", "Chikumbi L", 1, 3],
  ["BBA9425", "Managerial Economics", "Year 3/4", "Mulenga K", 1, 2],
  ["BBA9125", "International Business Management", "Year 3/4", "Kabwe S", 1, 2],
  ["BBA9115", "Entrepreneurship & Small Business Management", "Year 3/4", "Munkombwe O", 1, 3],
  ["BBA9415", "Risk Management and Insurance", "Year 3/4", "Mapipo C", 1, 2],
  ["ECN9155", "Health Economics", "Year 3/4", "Kaonga O", 1, 3],
  ["ECN9185", "Nutrition Economics", "Year 3/4", "Chitah B", 1, 2],
  ["ECN9415", "History of Economic Thought", "Year 3/4", "Chitah B", 1, 2],
  ["ECN5011", "Advanced Microeconomic Theory I", "Postgraduate", "Maboshe M", 1],
  ["ECN5021", "Advanced Macroeconomic Theory I", "Postgraduate", "Mulenga K", 1],
  ["ECN5201", "Mathematical Techniques and Programming", "Postgraduate", "Chimai B", 1],
  ["ECN5301", "Statistics for Economics and Econometrics", "Postgraduate", "Tounkara M", 1],
  ["ECN5604", "Research Methods in Economics", "Postgraduate", "Kaonga O", 1],
];

export const economicsCourses = courseRows.map(([code, title, level, lecturer, desiredStreams, allocatedSlots]) => ({
  code, title, level, lecturer, desiredStreams, allocatedSlots,
  sourcePage: courseRows.findIndex((row) => row[0] === code) < 12 ? 2 : courseRows.findIndex((row) => row[0] === code) < 27 ? 3 : 4,
}));

// Each cell represents one source hour, 07:00-19:00. Ambiguous text stays unresolved.
const grid: string[][] = [
  ["DLT BBA1110 (A); G3 ECN4121", "G7 BBA9425", "LAW 2 ECN9415; LLB", "G7 BBA4122", "LT2 BBA9125", "G3 BBA2210", "", "LT1 ECN4135; TLC1 ECN1115 (A); TLC2 BB2421", "LT2 ECN2311; TLC1 ECN1215 (A); TLC2 ECN3115", "LT1 ECN311; DLT ECN2115", "G7; LT2 BBA9415; LLB BBA3425", "LAW 3 BBA9115; G7; TLC2 BBA3222"],
  ["G3 ECN4121; LLB BBA9415", "DLT ECN3225", "TLC1 ECN1115 (B)", "G7 ECN9185", "LT1 ECN2331 (B)", "LLB BBA2311", "LAW 3; LT2 ECN4145; TLC2 BBA3235", "TLC1 ECN1215 (B)", "LT1 BBA3425; DLT ECN2315", "TLC2 BBA2210; LLB; DLT ECN9155", "TLC2 ECN2215", "LAW 3 BBA3235; LT2"],
  ["G3 BBA3211", "DLT ECN2215; LT1 ECN4145", "", "LAW 2 BBA9215; LT1 ECN3311", "LAW 2 ECN4145; LT1 ECN3311; LLB", "LT1 ECN2331 (A); G7 ECN4135; TLC2 ECN1215 (A)", "LAW 3 BBA9155", "LT2 BBA3415", "TLC1 ECN2115", "TLC1 ECN4411/BB4414; LLB ECN9415", "LT2 ECN9155; TLC1 ECN4411/BB4414; TLC2 ECN1115 (A)", "LAW 3"],
  ["DLT BBA1110 (B); G3 ECN4121", "DLT BBA1110 (C); LAW 2 ECN9415", "TLC2 ECN2311; G7 BBA9125; LT1 BBA9115", "LT1 BBA3415; LLB", "TLC2 ECN2331 (A); TLC1 ECN1215 (B)", "LLB; TLC1 ECN2331 (A)", "TLC2 ECN2115 B; LLB; VET A03 ECN2311", "LLB BBA3425", "TLC1 BBA2311; G7 ECN9415; TLC2 ECN1115 (B); LT2 BBA4122", "TLC1 ECN3225; G7 ECN9185; TLC2 BBA1110 (A); DLT ECN2115", "TLC2 ECN2210; LT2 ECN9155", "G7; LAW 3"],
  ["DLT BBA1110 (C); LT1 ECN2331 (B); G7 BBA3211; LT2 ECN9415", "LLB; DLT ECN2215", "LAW 3; G7 ECN4153; LT1 ECN3115; TLC1 BBA2210", "LLB; TLC1 ECN2315", "TLC1 BBA1110 (B); G3 BBA9125", "G7 ECN9185; TLC1 ECN2215", "LAW 3; LLB; LT1 BBA9425; VET A03 ECN3225; LT2 ECN9185", "", "", "LT1 ECN BBA2421; LAW 3", "TLC2 BB2311", "LAW 3 BBA9115; LLB 3425"],
];

export type EconomicsSourceSlot = {
  id: string; dayOfWeek: string; startTime: string; endTime: string;
  raw: string; roomCode: string; courseCode: string | null; stream: string; issues: string[];
};

export function parseEconomicsEntry(raw: string) {
  const match = /^(VET A03|LAW [23]|TLC[12]|LT[12]|DLT|G[37]|LLB)\s+((?:BBA|ECN)\d{4})(?:\s+\(?([A-D])\)?)?$/.exec(raw);
  const courseCode = match?.[2] || null;
  const known = economicsCourses.some((course) => course.code === courseCode);
  return {
    roomCode: match?.[1] || "", courseCode: known ? courseCode : null, stream: match?.[3] || "",
    issues: match && known ? [] : ["Source entry is missing, ambiguous, cross-listed or absent from the Draft 2 roster. Departmental correction is required."],
  };
}

export const economicsSlots: EconomicsSourceSlot[] = grid.flatMap((cells, day) => cells.flatMap((cell, hour) =>
  cell.split(";").map((value) => value.trim()).filter(Boolean).map((raw, entry) => ({
    id: `${ECONOMICS_SOURCE_VERSION}:${day}:${hour}:${entry}`,
    dayOfWeek: WEEKDAYS[day], startTime: `${String(hour + 7).padStart(2, "0")}:00`,
    endTime: `${String(hour + 8).padStart(2, "0")}:00`, raw, ...parseEconomicsEntry(raw),
  }))
));

export const economicsSourceWarnings = [
  "Both documents are drafts, not an approved timetable. Draft 5 supplies grid evidence; Draft 2 supplies the 34-course roster.",
  "The heading says 2025/2026 while filenames say 2026 Term I. Semester 1 is this application's local label for Term I; obtain departmental approval.",
  "All grid cells are one-hour source slots. Adjacent slots may be a single class; contact hours per stream must be approved before course configuration.",
  "Draft 2 allocated slots are course totals, not sessions per stream. BBA1110 requests 4 streams but shows 6 allocated slots; do not divide or invent missing streams.",
  "BBA4414 and ECN4411 share a lecturer/slot region in Draft 2. Their joint teaching and allocation totals need confirmation.",
  "Draft 5 contains incomplete codes, unlabelled venues, BBA3415/BBA9215/BBA9155/ECN2315/ECN2210 absent from the roster, and ECN4411/BB4414 cross-listing. None is silently corrected.",
  "Credits, room capacities/coordinates, student rosters, assessment dates and assessment policies are not supplied. No rooms, students, credits or assessments are fabricated.",
  "Typography extraction artifacts such as Administra6on have been normalized in course titles. Lecturers are source labels, not verified staff-account identities.",
];
