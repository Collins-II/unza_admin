import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdminRole, requireSystemAdmin } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import { auditedMutation } from "@/lib/audit";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";
import { ECONOMICS_ACADEMIC_YEAR, ECONOMICS_DEPARTMENT_CODE, ECONOMICS_DOCUMENTS, ECONOMICS_SEMESTER, ECONOMICS_SOURCE_VERSION, economicsCourses, economicsSlots, economicsSourceWarnings } from "@/lib/economicsSource";

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const [department, courses] = await Promise.all([
      Department.findOne({ code: ECONOMICS_DEPARTMENT_CODE }).select("_id code name faculty active").lean(),
      Course.find({ code: { $in: economicsCourses.map((course) => course.code) } }).select("_id code title department active catalogueOnly teachingSource").lean(),
    ]);
    return NextResponse.json({
      version: ECONOMICS_SOURCE_VERSION, academicYear: ECONOMICS_ACADEMIC_YEAR, semester: ECONOMICS_SEMESTER,
      documents: ECONOMICS_DOCUMENTS, warnings: economicsSourceWarnings, department, courses,
      sourceCourses: economicsCourses, slots: economicsSlots,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Economics source preview failed:", error);
    return NextResponse.json({ error: "Unable to load Economics source review." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) return access.response;
  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).length !== 1 || !("version" in input) || input.version !== ECONOMICS_SOURCE_VERSION) {
      return NextResponse.json({ error: "Review and submit the current source version." }, { status: 400 });
    }
    await connectToDatabase();
    await Promise.all([Department.init(), Course.init()]);
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Academic configuration is being updated. Retry shortly." }, { status: 409 });
    const heldLock = lock;
    const result = await auditedMutation(access.session.user.id, "economics.source.import", ECONOMICS_SOURCE_VERSION, {
      document: ECONOMICS_DOCUMENTS[0], courses: String(economicsCourses.length),
    }, async (session) => {
      await renewTimetableLock(heldLock);
      let department = await Department.findOne({ code: ECONOMICS_DEPARTMENT_CODE }).session(session);
      if (department && (department.name !== "Economics" || department.active === false)) {
        throw new Error("The Economics department is inactive or has conflicting details. Resolve it before import.");
      }
      if (!department) {
        [department] = await Department.create([{
          code: ECONOMICS_DEPARTMENT_CODE, name: "Economics", faculty: "School of Humanities and Social Sciences",
          sourceUrl: "https://www.unza.zm/humanities/economics", active: true,
        }], { session });
      }
      const preserved: string[] = [];
      const created: string[] = [];
      for (const source of economicsCourses) {
        const existing = await Course.findOne({ code: source.code }).session(session);
        if (existing) {
          if (String(existing.department) !== String(department._id) || existing.title !== source.title) {
            throw new Error(`Course ${source.code} conflicts with an existing title or department. No records were changed.`);
          }
          preserved.push(source.code);
          continue;
        }
        await Course.create([{
          code: source.code, title: source.title, department: department._id, level: source.level, lecturer: source.lecturer,
          catalogueOnly: true, active: false, preferredSpaceTypes: [],
          teachingSource: {
            document: ECONOMICS_DOCUMENTS[0], page: source.sourcePage, version: ECONOMICS_SOURCE_VERSION,
            academicYear: ECONOMICS_ACADEMIC_YEAR, term: "Term I", desiredStreams: source.desiredStreams, allocatedSlots: source.allocatedSlots,
          },
        }], { session });
        created.push(source.code);
      }
      await renewTimetableLock(heldLock);
      return { departmentId: String(department._id), created, preserved };
    });
    return NextResponse.json({ ...result, message: `${result.created.length} courses imported for review; ${result.preserved.length} existing courses preserved. Configure approved credits, teaching requirements and rosters before scheduling. Nothing was published.` });
  } catch (error) {
    console.error("Economics source import failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import Economics source." }, { status: error instanceof mongoose.Error ? 500 : 409 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
