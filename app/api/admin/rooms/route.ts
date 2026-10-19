import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Course from "@/lib/database/models/Course";
import Room from "@/lib/database/models/Room";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import { acquireTimetableConfigurationLock, releaseTimetableLock, renewTimetableLock } from "@/lib/timetableLock";

const spaceTypes = ["lecture_room", "laboratory", "seminar_room", "office", "library", "clinic", "cafeteria", "residence", "administrative", "other"] as const;

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const rooms = (await Room.find().sort({ building: 1, name: 1 }).lean()).map((room) => ({ ...room, spaceType: room.spaceType || "lecture_room" }));
    return NextResponse.json({ rooms });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load rooms." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  let lock: { key: string; token: string } | null = null;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A valid room record is required." }, { status: 400 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const building = typeof body.building === "string" ? body.building.trim() : "";
    const spaceType = typeof body.spaceType === "string" && spaceTypes.includes(body.spaceType as (typeof spaceTypes)[number]) ? body.spaceType : "";
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!name || !code || !building || !spaceType) return NextResponse.json({ error: "Name, code, building, and a valid location type are required." }, { status: 400 });
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) {
      return NextResponse.json({ error: "A real latitude and longitude are required for navigation. Use decimal degrees, not 0,0." }, { status: 400 });
    }
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 0 || (["lecture_room", "laboratory", "seminar_room"].includes(spaceType) && capacity < 1)) {
      return NextResponse.json({ error: "Teaching-space capacity must be a positive whole number." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "A timetable update is in progress. Retry after it finishes." }, { status: 409 });
    await renewTimetableLock(lock);
    const room = await Room.create({
      name, code, building,
      spaceType,
      floor: Number(body.floor) || 0,
      capacity,
      category: typeof body.category === "string" ? body.category : "lecture_hall",
      latitude,
      longitude,
      location: { type: "Point", coordinates: [longitude, latitude] },
      equipment: Array.isArray(body.equipment) ? body.equipment.filter((item: unknown): item is string => typeof item === "string") : [],
      description: typeof body.description === "string" ? body.description.trim() : "",
      isAvailable: body.isAvailable !== false,
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create room." }, { status: 500 });
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
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.id !== "string" || !mongoose.isValidObjectId(body.id)) return NextResponse.json({ error: "A valid room id is required." }, { status: 400 });
    const hasLatitude = body.latitude !== undefined;
    const hasLongitude = body.longitude !== undefined;
    const hasSpaceType = body.spaceType !== undefined;
    if (hasSpaceType && (typeof body.spaceType !== "string" || !spaceTypes.includes(body.spaceType as (typeof spaceTypes)[number]))) {
      return NextResponse.json({ error: "Invalid location type." }, { status: 400 });
    }
    if (hasLatitude !== hasLongitude) return NextResponse.json({ error: "Latitude and longitude must be updated together." }, { status: 400 });
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (hasLatitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0))) {
      return NextResponse.json({ error: "A real latitude and longitude are required for navigation. Use decimal degrees, not 0,0." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await acquireTimetableConfigurationLock();
    if (!lock) return NextResponse.json({ error: "A timetable update is in progress. Retry after it finishes." }, { status: 409 });
    const current = await Room.findById(body.id).lean();
    if (!current) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    const changesSchedulingData = hasLatitude || hasSpaceType ||
      (typeof body.isAvailable === "boolean" && body.isAvailable !== current.isAvailable);
    if (changesSchedulingData && await TimetableAllocation.exists({ room: current._id, status: { $ne: "cancelled" } })) {
      return NextResponse.json({ error: "Cancel existing allocations in this room before changing its availability, location, or teaching-space type." }, { status: 409 });
    }
    if (changesSchedulingData && await Course.exists({ preferredVenues: current._id, active: true })) {
      return NextResponse.json({ error: "Remove this room from active course preferences before changing its availability, location, or teaching-space type." }, { status: 409 });
    }
    await renewTimetableLock(lock);
    const room = await Room.findByIdAndUpdate(
      body.id,
      {
        ...(typeof body.isAvailable === "boolean" ? { isAvailable: body.isAvailable } : {}),
        ...(hasLatitude ? { latitude, longitude, location: { type: "Point", coordinates: [longitude, latitude] } } : {}),
        ...(hasSpaceType ? { spaceType: body.spaceType } : {}),
      },
      { new: true }
    ).lean();
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    return NextResponse.json({ room });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update room." }, { status: 500 });
  } finally {
    if (lock) await releaseTimetableLock(lock);
  }
}
