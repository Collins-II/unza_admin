import { NextResponse } from "next/server";
import { requireAdminRole, departmentScope, departmentDenied } from "@/lib/adminAuth";
import AcademicTerm from "@/lib/database/models/AcademicTerm";
import AssessmentAllocation from "@/lib/database/models/AssessmentAllocation";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import PublicationRequest from "@/lib/database/models/PublicationRequest";
import Course from "@/lib/database/models/Course";
import User from "@/lib/database/models/User";
import Booking from "@/lib/database/models/Booking";
import { campusDateString } from "@/lib/termSchedule";

export async function GET(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const academicYear = (params.get("academicYear") || "").trim();
    const semester = (params.get("semester") || "").trim();
    const department = params.get("department");
    if (!academicYear || academicYear.length > 30 || !semester || semester.length > 50 ||
        department && !/^[a-f\d]{24}$/i.test(department)) return NextResponse.json({ error: "Select a valid academic cycle and department." }, { status: 400 });
    if (department) { const denied = departmentDenied(access.session.user, department); if (denied) return denied; }
    const isAdmin = access.session.user.role === "admin";
    const scope = department ? { department } : departmentScope(access.session.user);
    const term = { academicYear, semester };
    const [calendar, pending, drafts, catalogue, unassigned, bookings, upcomingAssessments, legacy] = await Promise.all([
      AcademicTerm.findOne(term).select("status teachingStartDate teachingEndDate assessmentStartDate assessmentEndDate").lean(),
      PublicationRequest.countDocuments({ ...scope, status: "pending" }),
      TimetableAllocation.countDocuments({ ...term, ...scope, status: "draft" }),
      Course.countDocuments({ ...scope, catalogueOnly: true }),
      isAdmin ? User.countDocuments({ role: "staff", status: "active", "departmentIds.0": { $exists: false } }) : Promise.resolve(0),
      isAdmin ? Booking.countDocuments({ status: "pending" }) : Promise.resolve(0),
      AssessmentAllocation.find({ ...term, ...scope, status: { $ne: "cancelled" }, date: { $gte: campusDateString(new Date()) } })
        .select("course room title date startTime endTime assessmentType status").populate("course", "code").populate("room", "code")
        .sort({ date: 1, startTime: 1, _id: 1 }).limit(6).lean(),
      TimetableAllocation.countDocuments({ ...term, ...scope, status: "published" }),
    ]);
    const alerts = [
      ...(!calendar || calendar.status !== "approved" ? [{
        id: "calendar", title: "Approve this cycle's calendar", description: `${legacy ? `${legacy} legacy published classes remain visible. ` : ""}Publication and assessment scheduling need approved dates.`,
        count: 1, severity: "warning", destination: "calendar",
      }] : []),
      ...(pending ? [{ id: "reviews", title: "Publication reviews awaiting a decision", description: "Review the exact draft before approving. Self-approval is blocked.", count: pending, severity: "warning", destination: "approvals" }] : []),
      ...(drafts ? [{ id: "drafts", title: "Teaching drafts to complete", description: "Check streams and roster coverage, then submit complete courses for review.", count: drafts, severity: "info", destination: "timetable" }] : []),
      ...(catalogue ? [{ id: "catalogue", title: "Courses need approved scheduling details", description: "Catalogue entries are intentionally excluded until configured.", count: catalogue, severity: "info", destination: "courses" }] : []),
      ...(unassigned ? [{ id: "access", title: "Staff accounts without department access", description: "Assign explicit departments. Free-text department names do not grant access.", count: unassigned, severity: "warning", destination: "access" }] : []),
      ...(bookings ? [{ id: "bookings", title: "Student room requests to review", description: "Confirm eligible, conflict-free requests or explain cancellations.", count: bookings, severity: "info", destination: "bookings" }] : []),
    ];
    return NextResponse.json({ calendar, alerts, upcomingAssessments, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Operations command centre failed:", error);
    return NextResponse.json({ error: "Unable to load operations priorities." }, { status: 500 });
  }
}
