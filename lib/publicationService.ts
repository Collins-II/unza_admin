import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { NextResponse } from "next/server";
import PublicationRequest from "@/lib/database/models/PublicationRequest";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import { independentReviewer, type PublicationKind } from "@/lib/publicationPolicy";

export class PublicationError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export function publicationErrorResponse(error: unknown) {
  return error instanceof PublicationError ? NextResponse.json({ error: error.message }, { status: error.status }) : null;
}

export async function publicationSnapshot(kind: PublicationKind, target: string, academicYear: string, semester: string) {
  const records = kind === "assessment"
    ? await AssessmentAllocation.find({ _id: target }).sort({ _id: 1 }).lean()
    : await TimetableAllocation.find({ course: target, academicYear, semester, status: { $ne: "cancelled" } }).sort({ _id: 1 }).lean();
  if (!records.length || records.some((record) => record.status !== "draft")) {
    throw new PublicationError("Submit a complete draft. Published allocations must be returned to draft or cancelled before a new review.");
  }
  return {
    hash: createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    creators: records.flatMap((record) => [
      ...(record.createdBy ? [String(record.createdBy)] : []),
      ...("preparedBy" in record && Array.isArray(record.preparedBy) ? record.preparedBy.map(String) : []),
    ]),
    department: String(records[0].department),
  };
}

export async function validatePublicationReview(
  id: unknown, reviewer: { id: string; role: string }, kind: PublicationKind, target: string, academicYear: string, semester: string,
) {
  if (reviewer.role !== "admin") throw new PublicationError("Only an administrator can approve publication.", 403);
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) throw new PublicationError("Submit this draft for independent publication approval first.");
  const review = await PublicationRequest.findOne({ _id: id, kind, target, academicYear, semester, status: "pending" }).lean();
  if (!review) throw new PublicationError("A matching pending publication request is required.");
  const snapshot = await publicationSnapshot(kind, target, academicYear, semester);
  if (!independentReviewer(reviewer.id, String(review.submittedBy), snapshot.creators)) {
    throw new PublicationError("Self-approval is not permitted. Another administrator must review this submission.", 403);
  }
  if (snapshot.hash !== review.snapshot) throw new PublicationError("The draft changed after submission. Reject the stale request and submit the updated draft.");
  return String(review._id);
}

export async function completePublicationReview(id: string, actor: string, session: ClientSession) {
  const result = await PublicationRequest.updateOne({ _id: id, status: "pending" }, {
    $set: { status: "approved", reviewedBy: actor, reviewedAt: new Date() }, $inc: { __v: 1 },
  }, { session });
  if (result.modifiedCount !== 1) throw new PublicationError("The publication request was already decided. Reload and retry.");
}
