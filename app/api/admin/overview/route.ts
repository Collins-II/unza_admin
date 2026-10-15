import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import CommerceOrder from "@/lib/database/models/CommerceOrder";
import Room from "@/lib/database/models/Room";
import User from "@/lib/database/models/User";

export async function GET() {
  const access = await requireAdminRole();
  if (access.response) return access.response;

  try {
    await connectToDatabase();
    const [staff, rooms, activeRooms, bookings, pendingBookings, orders, recentUsers, recentBookings] =
      await Promise.all([
        User.countDocuments({ role: { $in: ["staff", "admin"] } }),
        Room.countDocuments(),
        Room.countDocuments({ isAvailable: true }),
        Booking.countDocuments(),
        Booking.countDocuments({ status: "pending" }),
        CommerceOrder.countDocuments({ status: "paid" }),
        User.find({ role: { $in: ["staff", "admin"] } }).select("name studentId email department status createdAt").sort({ createdAt: -1 }).limit(5).lean(),
        Booking.find().populate("user", "name studentId").populate("room", "name code").sort({ createdAt: -1 }).limit(8).lean(),
      ]);

    return NextResponse.json({
      metrics: { staff, rooms, activeRooms, bookings, pendingBookings, paidOrders: orders },
      recentUsers,
      recentBookings: recentBookings.map((booking) => ({
        id: String(booking._id),
        purpose: booking.purpose,
        status: booking.status,
        startTime: booking.startTime,
        endTime: booking.endTime,
        user: booking.user && typeof booking.user === "object" ? booking.user : null,
        room: booking.room && typeof booking.room === "object" ? booking.room : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load administration data." },
      { status: 500 }
    );
  }
}
