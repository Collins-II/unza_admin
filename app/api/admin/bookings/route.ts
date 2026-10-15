import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    await connectToDatabase();
    const bookings = await Booking.find().populate("user", "name studentId email").populate("room", "name code building").sort({ startTime: 1 }).limit(100).lean();
    return NextResponse.json({ bookings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load bookings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = await request.json();
    if (typeof body.id !== "string" || !["pending", "confirmed", "cancelled"].includes(body.status)) {
      return NextResponse.json({ error: "Booking id and valid status are required." }, { status: 400 });
    }
    await connectToDatabase();
    const booking = await Booking.findByIdAndUpdate(body.id, { status: body.status }, { new: true }).lean();
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    return NextResponse.json({ booking });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update booking." }, { status: 500 });
  }
}
