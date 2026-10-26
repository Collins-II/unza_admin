import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdminRole, requireSystemAdmin, departmentDenied, studentDepartmentScope } from "@/lib/adminAuth";
import Course from "@/lib/database/models/Course";
import { connectToDatabase } from "@/lib/database";
import { cellValue, csvCell, DataQueryError, escapeSearch, MAX_EXPORT_ROWS, normalizeStudentRegisterRecord, parseDataQuery } from "@/lib/adminData";

const headers = { "Cache-Control": "private, no-store" };
type Stage = Record<string, unknown>;
const projections = {
  students: "name studentId email department program year phone status mustChangePassword enrolledCourses createdAt",
  accounts: "name studentId email department departmentIds __v role status createdAt",
  departments: "code name faculty headOfDepartment active sourceUrl verifiedAt",
  courses: "code title department level semester credits expectedEnrollment lecturer sessionsPerWeek sessionMinutes preferredVenues preferredSpaceTypes active catalogueOnly sourceUrl verifiedAt teachingSource",
  rooms: "code name building capacity latitude longitude spaceType isAvailable",
  allocations: "academicYear semester department course room cohort lecturer dayOfWeek startTime endTime status stream streamSize streamCount notes",
  announcements: "title message audience priority createdAt",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const access = params.get("resource") === "accounts" ? await requireSystemAdmin() : await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const query = parseDataQuery(params);
    const { resource, register } = query;
    const match: Record<string, unknown> = {};
    if (resource === "students") match.role = "student";
    if (resource === "students" && params.get("course")) {
      const course = params.get("course")!;
      if (!mongoose.isValidObjectId(course)) throw new DataQueryError("Invalid student course filter.");
      match.enrolledCourses = new mongoose.Types.ObjectId(course);
    }
    if (resource === "accounts") match.role = { $in: ["staff", "admin"] };
    if (query.id) match._id = new mongoose.Types.ObjectId(query.id);
    if (query.ids.length) match._id = { $in: query.ids.map((id) => new mongoose.Types.ObjectId(id)) };
    if (query.status) {
      if (resource === "departments" || resource === "courses") {
        if (query.status === "catalogue") match.catalogueOnly = true;
        else match.active = query.status === "active";
      } else if (resource === "rooms") match.isAvailable = query.status === "available";
      else match.status = query.status;
    }
    for (const [field, value] of Object.entries(query.filters)) {
      if (field === "department" && ["courses", "allocations"].includes(resource)) {
        if (!mongoose.isValidObjectId(value)) throw new DataQueryError("Invalid department.");
        match.department = new mongoose.Types.ObjectId(value);
      } else if (["building", "faculty"].includes(field) || (resource === "accounts" && field === "department")) {
        match[field] = { $regex: escapeSearch(value), $options: "i" };
      } else match[field] = value;
    }
    await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database connection is unavailable.");
    if (access.session.user.role !== "admin") {
      const scopeIds = (access.session.user.departmentIds || []).map((id: string) => new mongoose.Types.ObjectId(id));
      const scoped: Record<string, unknown> = resource === "departments" ? { _id: { $in: scopeIds } }
        : ["courses", "allocations"].includes(resource) ? { department: { $in: scopeIds } } : {};
      if (resource === "students") {
        const courseId = params.get("course");
        if (courseId) {
          if (!mongoose.isValidObjectId(courseId)) throw new DataQueryError("Invalid course.");
          const course = await Course.findById(courseId).select("department").lean();
          if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
          const denied = departmentDenied(access.session.user, String(course.department));
          if (denied) return denied;
        }
        Object.assign(scoped, await studentDepartmentScope(access.session.user));
      }
      if (resource === "announcements") return NextResponse.json({ error: "Announcement management requires administrator access." }, { status: 403 });
      match.$and = [...(Array.isArray(match.$and) ? match.$and : []), scoped];
    }
    if (resource === "rooms" && params.get("teaching") === "1") match.spaceType = { $in: ["lecture_room", "laboratory", "seminar_room"] };
    const courseId = params.get("courseId");
    if (resource === "rooms" && courseId) {
      if (!mongoose.isValidObjectId(courseId)) throw new DataQueryError("Invalid course.");
      const course = await db.collection("courses").findOne({ _id: new mongoose.Types.ObjectId(courseId), active: true }, { projection: { preferredVenues: 1, preferredSpaceTypes: 1 } });
      if (!course) throw new DataQueryError("Select an active course.");
      if (Array.isArray(course.preferredVenues) && course.preferredVenues.length) match.$and = [...(Array.isArray(match.$and) ? match.$and : []), { _id: { $in: course.preferredVenues } }];
      if (Array.isArray(course.preferredSpaceTypes) && course.preferredSpaceTypes.length) match.spaceType = { $in: course.preferredSpaceTypes.filter((type) => ["lecture_room", "laboratory", "seminar_room"].includes(type)) };
    }
    const searchFields = [...register.search];
    if (query.search && resource === "allocations") {
      const pattern = { $regex: escapeSearch(query.search), $options: "i" };
      const [courses, rooms] = await Promise.all([
        db.collection("courses").find({ $or: [{ code: pattern }, { title: pattern }] }, { projection: { _id: 1 } }).limit(1001).toArray(),
        db.collection("rooms").find({ $or: [{ code: pattern }, { name: pattern }] }, { projection: { _id: 1 } }).limit(1001).toArray(),
      ]);
      if (courses.length > 1000 || rooms.length > 1000) throw new DataQueryError("Use a more specific course or room search.");
      match.$or = [
        ...searchFields.map((field) => ({ [field]: pattern })),
        { course: { $in: courses.map((course) => course._id) } }, { room: { $in: rooms.map((room) => room._id) } },
      ];
    } else if (query.search) match.$or = searchFields.map((field) => ({ [field]: { $regex: escapeSearch(query.search), $options: "i" } }));

    const collection = db.collection(register.collection);
    const total = await collection.countDocuments(match, { maxTimeMS: 15000 });
    const page = Math.min(query.page, Math.max(0, Math.ceil(total / query.limit) - 1));
    const exporting = params.get("export") === "csv";
    if (exporting && total > MAX_EXPORT_ROWS) return NextResponse.json({ error: `Export is limited to ${MAX_EXPORT_ROWS.toLocaleString()} records. Narrow your filters and retry.` }, { status: 422, headers });
    const pipeline: Stage[] = [{ $match: match }];
    if (resource === "allocations" && query.sort === "dayOfWeek") {
      pipeline.push(
        { $addFields: { _dayOrder: { $indexOfArray: [["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], "$dayOfWeek"] } } },
        { $sort: { _dayOrder: query.direction, startTime: query.direction, _id: query.direction } },
      );
    } else pipeline.push({ $sort: { [query.sort]: query.direction, _id: query.direction } });
    if (!exporting) pipeline.push({ $skip: page * query.limit }, { $limit: query.limit });
    else pipeline.push({ $limit: MAX_EXPORT_ROWS + 1 });
    const lookup = (from: string, field: string, fields: string) => {
      pipeline.push({ $lookup: {
        from, localField: field, foreignField: "_id", as: field,
        pipeline: [{ $project: Object.fromEntries(fields.split(" ").map((key) => [key, 1])) }],
      } });
      if (field !== "preferredVenues") pipeline.push({ $unwind: { path: `$${field}`, preserveNullAndEmptyArrays: true } });
    };
    // Exclude credentials and large stream membership arrays even on detail/export requests.
    pipeline.push({ $project: Object.fromEntries(projections[resource].split(" ").map((key) => [key, 1])) });
    if (resource === "courses" || resource === "allocations") lookup("departments", "department", "code name faculty");
    if (resource === "courses") lookup("rooms", "preferredVenues", "code name building capacity latitude longitude");
    if (resource === "allocations") {
      lookup("courses", "course", "code title expectedEnrollment");
      lookup("rooms", "room", "code name building");
    }
    const cursor = collection.aggregate(pipeline, { maxTimeMS: 30000, batchSize: 100 });
    if (exporting) {
      const encoder = new TextEncoder();
      const columns = register.columns;
      let exported = 0;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(encoder.encode("\uFEFF" + columns.map((column) => csvCell(column.label)).join(",") + "\r\n")); },
        async pull(controller) {
          try {
            const record = await cursor.next();
            if (!record) { await cursor.close(); controller.close(); return; }
            exported += 1;
            if (exported > MAX_EXPORT_ROWS) throw new Error("The register changed during export. Narrow the filters and retry.");
            controller.enqueue(encoder.encode(columns.map((column) => csvCell(cellValue(record, column.key))).join(",") + "\r\n"));
          } catch (error) {
            console.error("Admin CSV export failed", { resource });
            await cursor.close();
            controller.error(error);
          }
        },
        async cancel() { await cursor.close(); },
      });
      return new Response(stream, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${resource}.csv"` } });
    }
    const documents = await cursor.toArray();
    const records = resource === "students" ? documents.map(normalizeStudentRegisterRecord) : documents;
    return NextResponse.json({ records, total, page, pageSize: query.limit }, { headers });
  } catch (error) {
    if (!(error instanceof DataQueryError)) console.error("Admin register query failed", { resource: params.get("resource"), error: error instanceof Error ? error.name : "Unknown" });
    return NextResponse.json({ error: error instanceof DataQueryError ? error.message : "Unable to load this register. Please retry." }, { status: error instanceof DataQueryError ? 400 : 500, headers });
  }
}
