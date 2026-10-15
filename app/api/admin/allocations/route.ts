import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import { isTimeRangeValid, rangesOverlap, WEEKDAYS } from "@/lib/timetable";

type AllocationInput = {
  id?: string;
  academicYear?: string;
  semester?: string;
  department?: string;
  course?: string;
  room?: string;
  cohort?: string;
  lecturer?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  notes?: string;
};

async function findConflict(input: AllocationInput) {
  const { id, academicYear, semester, room, cohort, lecturer, dayOfWeek, startTime, endTime } = input;
  const candidates = await TimetableAllocation.find({
    ...(id ? { _id: { $ne: id } } : {}),
    academicYear,
    semester,
    dayOfWeek,
    status: { $ne: "cancelled" },
    $or: [
      { room },
      { cohort },
      ...(lecturer ? [{ lecturer }] : []),
    ],
  }).populate("room", "name code").populate("course", "code title").lean();

  return candidates.find((candidate) => rangesOverlap(startTime || "", endTime || "", candidate.startTime, candidate.endTime));
}

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    await connectToDatabase();
    const allocations = await TimetableAllocation.find({
      ...(params.get("academicYear") ? { academicYear: params.get("academicYear") } : {}),
      ...(params.get("semester") ? { semester: params.get("semester") } : {}),
      ...(params.get("department") ? { department: params.get("department") } : {}),
      ...(params.get("dayOfWeek") ? { dayOfWeek: params.get("dayOfWeek") } : {}),
      status: { $ne: "cancelled" },
    })
      .populate("department", "code name faculty")
      .populate("course", "code title level expectedEnrollment lecturer")
      .populate("room", "name code building capacity")
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();
    return NextResponse.json({ allocations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load timetable allocations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as AllocationInput;
    const required = [body.academicYear, body.semester, body.department, body.course, body.room, body.cohort, body.dayOfWeek, body.startTime, body.endTime];
    if (required.some((value) => !value) || !WEEKDAYS.includes(body.dayOfWeek as (typeof WEEKDAYS)[number]) || !isTimeRangeValid(body.startTime || "", body.endTime || "")) {
      return NextResponse.json({ error: "Academic year, semester, department, course, room, cohort, weekday, and a valid time range are required." }, { status: 400 });
    }

    await connectToDatabase();
    const [department, course, room] = await Promise.all([
      Department.findById(body.department).lean(),
      Course.findById(body.course).lean(),
      Room.findById(body.room).lean(),
    ]);
    if (!department || !course || !room) return NextResponse.json({ error: "Department, course, or room was not found." }, { status: 404 });
    if (!["lecture_room", "laboratory", "seminar_room"].includes(room.spaceType || "lecture_room")) {
      return NextResponse.json({ error: "Only teaching spaces can receive timetable allocations. Select a lecture room, laboratory, or seminar room." }, { status: 409 });
    }
    if (!room.isAvailable) return NextResponse.json({ error: "This room is currently offline." }, { status: 409 });
    if ((room.capacity || 0) < 1 || (course.expectedEnrollment || 0) > (room.capacity || 0)) {
      return NextResponse.json({ error: `Room capacity (${room.capacity || 0}) is below expected enrollment (${course.expectedEnrollment}).` }, { status: 409 });
    }

    const conflict = await findConflict(body);
    if (conflict) {
      const conflictRoom = typeof conflict.room === "object" && conflict.room ? conflict.room.name : "the selected room";
      const conflictCourse = typeof conflict.course === "object" && conflict.course ? conflict.course.code : "another class";
      return NextResponse.json({ error: `Scheduling conflict: ${conflictCourse} already uses ${conflictRoom} or the same cohort/lecturer during this period.` }, { status: 409 });
    }

    const allocation = await TimetableAllocation.create({
      academicYear: body.academicYear,
      semester: body.semester,
      department: body.department,
      course: body.course,
      room: body.room,
      cohort: body.cohort,
      lecturer: body.lecturer?.trim(),
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      status: body.status === "published" ? "published" : "draft",
      notes: body.notes?.trim(),
    });
    const populated = await TimetableAllocation.findById(allocation._id).populate("department", "code name").populate("course", "code title").populate("room", "name code building capacity").lean();
    return NextResponse.json({ allocation: populated }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create timetable allocation." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as AllocationInput;
    if (!body.id) return NextResponse.json({ error: "Allocation id is required." }, { status: 400 });
    await connectToDatabase();
    const current = await TimetableAllocation.findById(body.id).lean();
    if (!current) return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
    if (body.status && !["draft", "published", "cancelled"].includes(body.status)) return NextResponse.json({ error: "Invalid allocation status." }, { status: 400 });
    const update = body.status ? { status: body.status } : body;
    const allocation = await TimetableAllocation.findByIdAndUpdate(body.id, update, { new: true }).populate("department", "code name").populate("course", "code title").populate("room", "name code building capacity").lean();
    return NextResponse.json({ allocation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update timetable allocation." }, { status: 500 });
  }
}
