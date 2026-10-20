import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/database";
import Announcement from "@/lib/database/models/Announcement";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import { requireStudentIntegrationKey } from "@/lib/studentIntegrationAuth";

export async function GET(request: Request) {
  const denied = requireStudentIntegrationKey(request);
  if (denied) return denied;

  try {
    const params = new URL(request.url).searchParams;
    const requestedType = params.get("type");
    const validTypes = ["lecture_room", "laboratory", "seminar_room", "office", "library", "clinic", "cafeteria", "residence", "administrative", "other"];
    const typeFilter = requestedType && validTypes.includes(requestedType) ? requestedType : null;
    await connectToDatabase();
    const [rawRooms, departments, allocations, announcements, courses] = await Promise.all([
      Room.find({
        isAvailable: true,
        ...(typeFilter ? { spaceType: typeFilter } : {}),
      }).select("name code building floor capacity spaceType category latitude longitude location equipment description").sort({ building: 1, name: 1 }).lean(),
      Department.find({ active: true }).select("code name faculty").sort({ faculty: 1, name: 1 }).lean(),
      TimetableAllocation.find({
        status: "published",
        ...(params.get("academicYear") ? { academicYear: params.get("academicYear") } : {}),
        ...(params.get("semester") ? { semester: params.get("semester") } : {}),
        ...(params.get("department") ? { department: params.get("department") } : {}),
      }).select("-streamStudentIds").populate("department", "code name").populate("course", "code title level").populate("room", "name code building capacity spaceType latitude longitude location").lean(),
      Announcement.find({ audience: { $in: ["all", "students"] } }).select("title message priority createdAt").sort({ createdAt: -1 }).limit(30).lean(),
      Course.find({ active: true, ...(params.get("department") ? { department: params.get("department") } : {}) }).select("code title department level credits semester lecturer").sort({ code: 1 }).lean(),
    ]);
    const rooms = rawRooms;

    return NextResponse.json({
      version: 1,
      generatedAt: new Date().toISOString(),
      rooms,
      departments,
      timetable: allocations,
      announcements,
      courses,
    }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load campus data." }, { status: 500 });
  }
}
