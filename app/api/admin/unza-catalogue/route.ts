import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdminRole, requireSystemAdmin } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Department from "@/lib/database/models/Department";
import Course from "@/lib/database/models/Course";
import { validateUnzaCatalogue } from "@/lib/unzaCatalogue";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";
import AuditEvent from "@/lib/database/models/AuditEvent";
import { recordAudit } from "@/lib/audit";

async function readCatalogue() {
  const data: unknown = JSON.parse(await readFile(join(process.cwd(), "fixtures", "unza", "catalogue.json"), "utf8"));
  validateUnzaCatalogue(data);
  return data;
}

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const catalogue = await readCatalogue();
    await connectToDatabase();
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const [departments, courses] = await Promise.all([
        Department.countDocuments({ code: { $in: catalogue.departments.map((department) => department.code) } }),
        Course.countDocuments({ catalogueOnly: true }),
      ]);
      return NextResponse.json({ verifiedAt: catalogue.verifiedAt, scopeNote: catalogue.scopeNote, available: { departments: catalogue.departments.length, courses: catalogue.courses.length }, imported: { departments, courses } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [courses, departments] = await Promise.all([
      Course.find({ catalogueOnly: true }).select("code title department sourceUrl verifiedAt").populate("department", "name code faculty").sort({ code: 1 }).lean(),
      Department.find({ code: { $in: catalogue.departments.map((department) => department.code) } }).select("code name faculty sourceUrl verifiedAt").sort({ faculty: 1, name: 1 }).lean(),
    ]);
    return NextResponse.json({ verifiedAt: catalogue.verifiedAt, scopeNote: catalogue.scopeNote, available: { departments: catalogue.departments.length, courses: catalogue.courses.length }, departments, courses }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read UNZA catalogue." }, { status: 500 });
  }
}

export async function POST() {
  const access = await requireSystemAdmin();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const catalogue = await readCatalogue();
    await connectToDatabase();
    await Promise.all([Department.createIndexes(), Course.createIndexes(), AuditEvent.init()]);
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Another timetable update is in progress. Retry shortly." }, { status: 409 });
    const heldLock = lock;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await renewTimetableLock(heldLock);
        const departmentIds = new Map<string, mongoose.Types.ObjectId>();
        for (const department of catalogue.departments) {
          const current = await Department.findOne({ code: department.code }).session(session);
          if (current && (current.name !== department.name || current.faculty !== department.faculty)) {
            throw new Error(`Department ${department.code} conflicts with an existing record; no records were changed.`);
          }
          const saved = current || (await Department.create([{ ...department, verifiedAt: catalogue.verifiedAt, active: true }], { session }))[0];
          departmentIds.set(department.code, saved._id);
        }
        const existingCourses = await Course.find({ code: { $in: catalogue.courses.map((course) => course.code) } }).session(session);
        const existingByCode = new Map(existingCourses.map((course) => [course.code, course]));
        const pending = [];
        for (const course of catalogue.courses) {
          const department = departmentIds.get(course.departmentCode);
          const current = existingByCode.get(course.code);
          if (current) {
            if (current.title !== course.title || String(current.department) !== String(department)) {
              throw new Error(`Course ${course.code} conflicts with an existing record; no records were changed.`);
            }
            continue;
          }
          pending.push({
            code: course.code, title: course.title, department, sourceUrl: course.sourceUrl, verifiedAt: catalogue.verifiedAt,
            catalogueOnly: true, active: false, sessionsPerWeek: undefined, sessionMinutes: undefined,
            preferredSpaceTypes: [],
          });
        }
        if (pending.length) await Course.insertMany(pending, { session });
        await recordAudit(session, access.session.user.id, "catalogue.import", "UNZA", {
          verifiedAt: catalogue.verifiedAt, departments: String(catalogue.departments.length), newCourses: String(pending.length),
        });
        await renewTimetableLock(heldLock);
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ departments: catalogue.departments.length, courses: catalogue.courses.length, verifiedAt: catalogue.verifiedAt, message: "Verified UNZA catalogue imported. Courses remain unscheduled until approved scheduling details are supplied." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import UNZA catalogue." }, { status: 409 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
