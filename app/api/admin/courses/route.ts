import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Room from "@/lib/database/models/Room";
import Department from "@/lib/database/models/Department";
import { DEFAULT_VENUE_RADIUS_M, TEACHING_SPACES, distanceMeters } from "@/lib/timetableGenerator";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";

const VENUE_FIELDS = "code name building capacity latitude longitude";

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const courses = (await Course.find({ active: true }).populate("department", "code name faculty").populate("preferredVenues", VENUE_FIELDS).sort({ code: 1 }).lean()).map((course) => ({
      ...course,
      preferredSpaceTypes: course.preferredSpaceTypes?.length ? course.preferredSpaceTypes : TEACHING_SPACES,
    }));
    return NextResponse.json({ courses });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load courses." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A valid course record is required." }, { status: 400 });
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const department = typeof body.department === "string" ? body.department : "";
    const level = typeof body.level === "string" ? body.level.trim() : "";
    const semester = typeof body.semester === "string" ? body.semester.trim() : "";
    const expectedEnrollment = Number(body.expectedEnrollment);
    const credits = Number(body.credits);
    const sessionsPerWeek = boundedInteger(body.sessionsPerWeek, 2, 1, 6);
    const sessionMinutes = boundedInteger(body.sessionMinutes, 120, 30, 300);
    const preferredSpaceTypes = body.preferredSpaceTypes === undefined ? TEACHING_SPACES : body.preferredSpaceTypes;
    if (!code || !title || !department || !level || !semester || !Number.isInteger(expectedEnrollment) || expectedEnrollment < 1 || !Number.isInteger(credits) || credits < 1) {
      return NextResponse.json({ error: "Course code, title, department, level, semester, credits, and enrollment are required." }, { status: 400 });
    }
    if (sessionsPerWeek === null || sessionMinutes === null || sessionMinutes % 30 !== 0 ||
      !Array.isArray(preferredSpaceTypes) || preferredSpaceTypes.length === 0 || preferredSpaceTypes.some((type: unknown) => typeof type !== "string" || !TEACHING_SPACES.includes(type))) {
      return NextResponse.json({ error: "Sessions per week must be 1-6 and session length 30-300 minutes in 30-minute steps." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "A timetable update is in progress. Retry after it finishes." }, { status: 409 });
    await renewTimetableLock(lock);
    if (!mongoose.isValidObjectId(department) || !await Department.exists({ _id: department, active: true })) {
      return NextResponse.json({ error: "An active department is required." }, { status: 400 });
    }
    const catalogue = await Course.findOne({ code, catalogueOnly: true });
    if (catalogue && (catalogue.title !== title || String(catalogue.department) !== department)) {
      return NextResponse.json({ error: "Keep the verified course title and department when configuring a catalogue course." }, { status: 409 });
    }
    const values = { code, title, department, level, semester, expectedEnrollment, credits, sessionsPerWeek, sessionMinutes, preferredSpaceTypes, lecturer: typeof body.lecturer === "string" ? body.lecturer.trim() : "", active: true, catalogueOnly: false };
    const course = catalogue ? await Course.findByIdAndUpdate(catalogue._id, { $set: values }, { new: true, runValidators: true }) : await Course.create(values);
    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create course." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.id !== "string" || !mongoose.isValidObjectId(body.id)) return NextResponse.json({ error: "A valid course id is required." }, { status: 400 });
    const hasActive = typeof body.active === "boolean";
    if ((body.active !== undefined && !hasActive) ||
      (!hasActive && !["preferredVenues", "preferredSpaceTypes", "sessionsPerWeek", "sessionMinutes", "expectedEnrollment", "lecturer"].some((field) => body[field] !== undefined))) {
      return NextResponse.json({ error: "At least one valid course update is required." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "A timetable update is in progress. Retry after it finishes." }, { status: 409 });
    const course = await Course.findById(body.id);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (await TimetableAllocation.exists({ course: course._id, status: { $ne: "cancelled" } })) {
      return NextResponse.json({ error: "Cancel this course's existing timetable allocations before changing its scheduling settings." }, { status: 409 });
    }

    if (body.preferredVenues !== undefined) {
      if (!Array.isArray(body.preferredVenues) || body.preferredVenues.some((id: unknown) => typeof id !== "string")) {
        return NextResponse.json({ error: "Venues must be a list of room ids." }, { status: 400 });
      }
      const ids: string[] = [...new Set<string>(body.preferredVenues)];
      if (ids.some((id) => !mongoose.isValidObjectId(id))) return NextResponse.json({ error: "One or more venue ids are invalid." }, { status: 400 });
      const rooms = await Room.find({ _id: { $in: ids } }).lean();
      if (rooms.length !== ids.length) return NextResponse.json({ error: "One or more venues were not found." }, { status: 404 });
      const byId = new Map(rooms.map((room) => [String(room._id), room]));
      const ordered = ids.map((id) => byId.get(id)!);
      const unsuitable = ordered.find((room) => !TEACHING_SPACES.includes(room.spaceType || "lecture_room"));
      if (unsuitable) return NextResponse.json({ error: `${unsuitable.code} is not a teaching space.` }, { status: 409 });
      const radius = Number(body.maxVenueRadiusM ?? DEFAULT_VENUE_RADIUS_M);
      if (!Number.isFinite(radius) || radius < 50 || radius > 5000) return NextResponse.json({ error: "Venue radius must be between 50 m and 5000 m." }, { status: 400 });
      const offline = ordered.find((room) => !room.isAvailable);
      if (offline) return NextResponse.json({ error: `${offline.code} is offline and cannot be assigned as a preferred venue.` }, { status: 409 });
      const anchor = ordered[0];
      const tooFar = anchor ? ordered.find((room) => distanceMeters(room, anchor) > radius) : undefined;
      if (tooFar) {
        return NextResponse.json({ error: `${tooFar.code} is ${Math.round(distanceMeters(tooFar, anchor))} m from ${anchor.code}. Venues for one course must be within ${radius} m of the first venue.` }, { status: 409 });
      }
      course.preferredVenues = ids.map((id) => new mongoose.Types.ObjectId(id));
    }

    if (body.preferredSpaceTypes !== undefined) {
      if (!Array.isArray(body.preferredSpaceTypes) || body.preferredSpaceTypes.length === 0 || body.preferredSpaceTypes.some((type: unknown) => typeof type !== "string" || !TEACHING_SPACES.includes(type))) {
        return NextResponse.json({ error: "Select one or more valid teaching-space types." }, { status: 400 });
      }
      course.preferredSpaceTypes = [...new Set<string>(body.preferredSpaceTypes)];
    }
    if (course.preferredVenues.length) {
      const preferredRooms = await Room.find({ _id: { $in: course.preferredVenues } }).select("code spaceType").lean();
      const incompatible = preferredRooms.find((room) => !course.preferredSpaceTypes.includes((room.spaceType || "lecture_room") as (typeof TEACHING_SPACES)[number]));
      if (incompatible) return NextResponse.json({ error: `${incompatible.code} does not match the course's preferred teaching-space types.` }, { status: 409 });
    }
    const sessionsPerWeek = boundedInteger(body.sessionsPerWeek, course.sessionsPerWeek, 1, 6);
    const sessionMinutes = boundedInteger(body.sessionMinutes, course.sessionMinutes, 30, 300);
    const expectedEnrollment = boundedInteger(body.expectedEnrollment, course.expectedEnrollment, 1, 100000);
    if (sessionsPerWeek === null || sessionMinutes === null || sessionMinutes % 30 !== 0 || expectedEnrollment === null) {
      return NextResponse.json({ error: "Invalid sessions per week, session length, or enrollment." }, { status: 400 });
    }
    course.sessionsPerWeek = sessionsPerWeek;
    course.sessionMinutes = sessionMinutes;
    course.expectedEnrollment = expectedEnrollment;
    if (hasActive) course.active = body.active;
    if (typeof body.lecturer === "string") course.lecturer = body.lecturer.trim();
    await renewTimetableLock(lock);
    await course.save();

    const updated = await Course.findById(course._id).populate("department", "code name faculty").populate("preferredVenues", VENUE_FIELDS).lean();
    return NextResponse.json({ course: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update course." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
