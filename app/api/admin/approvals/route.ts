import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdminRole, requireSystemAdmin, departmentDenied, departmentScope } from "@/lib/adminAuth";
import PublicationRequest from "@/lib/database/models/PublicationRequest";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import { validPublicationKind } from "@/lib/publicationPolicy";
import { PublicationError, publicationSnapshot } from "@/lib/publicationService";
import { auditedMutation } from "@/lib/audit";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";
import { requireApprovedTerm, AcademicCalendarError } from "@/lib/academicCalendarService";

export async function GET(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const raw = params.get("page") || "0";
    const status = params.get("status") || "pending";
    if (!/^\d{1,5}$/.test(raw) || !["pending", "approved", "rejected"].includes(status)) return NextResponse.json({ error: "Invalid approval filters." }, { status: 400 });
    const page = Number(raw);
    const filter = { ...departmentScope(access.session.user), status };
    const [requests, total] = await Promise.all([
      PublicationRequest.find(filter).select("-snapshot").populate("department", "code name")
        .populate("submittedBy", "name").populate("reviewedBy", "name")
        .sort({ createdAt: -1, _id: -1 }).skip(page * 25).limit(25).lean(),
      PublicationRequest.countDocuments(filter),
    ]);
    return NextResponse.json({ requests, total, page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Publication queue failed:", error);
    return NextResponse.json({ error: "Unable to load publication requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["kind", "id"].includes(key)) ||
        !validPublicationKind(body.kind) || typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id)) {
      return NextResponse.json({ error: "Select a teaching or assessment draft to submit." }, { status: 400 });
    }
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "Academic updates are busy. Retry shortly." }, { status: 409 });
    access = await requireAdminRole({ departmental: true });
    if (access.response) return access.response;
    const model = body.kind === "teaching" ? TimetableAllocation : AssessmentAllocation;
    const record = await model.findById(body.id).lean();
    if (!record || record.status !== "draft") return NextResponse.json({ error: "Draft allocation not found." }, { status: 404 });
    const denied = departmentDenied(access.session.user, String(record.department));
    if (denied) return denied;
    await requireApprovedTerm(record.academicYear, record.semester);
    const target = body.kind === "teaching" ? String(record.course) : String(record._id);
    const snapshot = await publicationSnapshot(body.kind, target, record.academicYear, record.semester);
    await PublicationRequest.init();
    await renewTimetableLock(lock);
    const actorId = access.session.user.id;
    const [submission] = await auditedMutation(actorId, "publication.submit", target, { kind: body.kind }, (session) =>
      PublicationRequest.create([{
        kind: body.kind, target, department: record.department, academicYear: record.academicYear, semester: record.semester,
        snapshot: snapshot.hash, submittedBy: actorId, status: "pending",
      }], { session }));
    return NextResponse.json({ id: String(submission._id), message: "Submitted for independent administrator review. Nothing is published yet." }, { status: 201 });
  } catch (error) {
    if (error instanceof AcademicCalendarError || error instanceof PublicationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) return NextResponse.json({ error: "A pending review already exists. Review or reject it before resubmitting." }, { status: 409 });
    console.error("Publication submission failed:", error);
    return NextResponse.json({ error: "Unable to submit publication review." }, { status: 500 });
  } finally { if (lock) await releaseTimetableLock(lock); }
}

export async function PATCH(request: Request) {
  let access = await requireSystemAdmin();
  if (access.response) return access.response;
  let lock: Awaited<ReturnType<typeof acquireTimetableConfigurationLock>> = null;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["id", "decision", "reason"].includes(key)) ||
        typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id) || !["approve", "reject"].includes(body.decision) ||
        (body.decision === "reject" && (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000))) {
      return NextResponse.json({ error: "A valid request and decision are required; rejection needs a reason (max 1000 characters)." }, { status: 400 });
    }
    if (body.decision === "reject") {
      lock = await acquireTimetableConfigurationLock();
      if (!lock) return NextResponse.json({ error: "Academic configuration is busy. Retry shortly." }, { status: 409 });
      access = await requireSystemAdmin();
      if (access.response) return access.response;
      const actorId = access.session.user.id;
      const result = await auditedMutation(actorId, "publication.reject", body.id, { reason: body.reason.trim() }, (session) =>
        PublicationRequest.findOneAndUpdate({ _id: body.id, status: "pending" }, {
          $set: { status: "rejected", reason: body.reason.trim(), reviewedBy: actorId, reviewedAt: new Date() }, $inc: { __v: 1 },
        }, { new: true, session }).lean());
      if (!result) return NextResponse.json({ error: "Pending request not found." }, { status: 409 });
      return NextResponse.json({ message: "Review rejected. The draft is preserved for correction." });
    }
    const review = await PublicationRequest.findOne({ _id: body.id, status: "pending" }).lean();
    if (!review) return NextResponse.json({ error: "Pending request not found." }, { status: 404 });
    if (review.kind === "assessment") {
      const allocation = await AssessmentAllocation.findById(review.target).select("__v").lean();
      if (!allocation) return NextResponse.json({ error: "Assessment no longer exists." }, { status: 409 });
      const { PATCH } = await import("@/app/api/admin/assessments/route");
      return PATCH(new Request(request.url, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: String(review.target), expectedVersion: allocation.__v, status: "published", approvalId: body.id }) }));
    }
    const allocation = await TimetableAllocation.findOne({ course: review.target, academicYear: review.academicYear, semester: review.semester, status: "draft" }).select("_id").lean();
    if (!allocation) return NextResponse.json({ error: "Teaching draft no longer exists." }, { status: 409 });
    const { PATCH } = await import("@/app/api/admin/allocations/route");
    return PATCH(new Request(request.url, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: String(allocation._id), status: "published", approvalId: body.id }) }));
  } catch (error) {
    console.error("Publication decision failed:", error);
    return NextResponse.json({ error: "Unable to process publication decision." }, { status: 500 });
  } finally { if (lock) await releaseTimetableLock(lock); }
}
