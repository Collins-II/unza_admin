import { NextResponse } from "next/server";
import { requireAdminRole, departmentDenied } from "@/lib/adminAuth";
import PublicationRequest from "@/lib/database/models/PublicationRequest";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";

export async function GET(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "Valid review id required." }, { status: 400 });
    const review = await PublicationRequest.findById(id).lean();
    if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    const denied = departmentDenied(access.session.user, String(review.department));
    if (denied) return denied;
    const allocations = review.kind === "assessment"
      ? await AssessmentAllocation.find({ _id: review.target }).select("course room date title startTime endTime status studentIds").populate("course", "code title").populate("room", "code").lean()
      : await TimetableAllocation.find({ course: review.target, academicYear: review.academicYear, semester: review.semester, status: { $ne: "cancelled" } })
        .select("course room dayOfWeek startTime endTime status streamSize").populate("course", "code title").populate("room", "code").sort({ dayOfWeek: 1, startTime: 1 }).limit(501).lean();
    if (allocations.length > 500) {
      return NextResponse.json({ error: "This submission exceeds the 500-session review limit. Return it for correction; no incomplete review is shown." }, { status: 409 });
    }
    return NextResponse.json({
      title: `${allocations[0]?.course?.code || "Unavailable course"} · ${allocations[0]?.course?.title || "Publication review"}`,
      rows: allocations.map((row) => ({
        id: String(row._id), when: `${row.date || row.dayOfWeek} ${row.startTime}-${row.endTime}`,
        room: row.room?.code || "Unavailable venue", students: row.studentIds?.length || row.streamSize || 0, status: row.status,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Publication detail failed:", error);
    return NextResponse.json({ error: "Unable to load review details." }, { status: 500 });
  }
}
