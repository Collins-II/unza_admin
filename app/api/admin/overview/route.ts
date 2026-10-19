import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import CommerceOrder from "@/lib/database/models/CommerceOrder";
import Room from "@/lib/database/models/Room";
import User from "@/lib/database/models/User";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import mongoose from "mongoose";

export async function GET(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;

  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const department = params.get("department");
    if (department && !mongoose.isValidObjectId(department)) return NextResponse.json({ error: "Invalid department filter." }, { status: 400 });
    const term = {
      academicYear: params.get("academicYear") || "2026/2027", semester: params.get("semester") || "Semester 1",
      ...(department ? { department: new mongoose.Types.ObjectId(department) } : {}), status: { $ne: "cancelled" },
    };
    const [staff, students, rooms, activeRooms, bookings, pendingBookings, orders, recentUsers, recentBookings, departments, courses, schedule] =
      await Promise.all([
        User.countDocuments({ role: { $in: ["staff", "admin"] } }),
        User.countDocuments({ role: "student", status: "active" }),
        Room.countDocuments(),
        Room.countDocuments({ isAvailable: true }),
        Booking.countDocuments(),
        Booking.countDocuments({ status: "pending" }),
        CommerceOrder.countDocuments({ status: "paid" }),
        User.find({ role: { $in: ["staff", "admin"] } }).select("name studentId email department status createdAt").sort({ createdAt: -1 }).limit(5).lean(),
        Booking.find().populate("user", "name studentId").populate("room", "name code").sort({ createdAt: -1 }).limit(8).lean(),
        Department.countDocuments(),
        Course.countDocuments({ active: true }),
        TimetableAllocation.aggregate([
          { $match: term },
          { $group: { _id: null, allocations: { $sum: 1 }, publishedClasses: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } }, rooms: { $addToSet: "$room" }, departments: { $addToSet: "$department" } } },
          { $project: { _id: 0, allocations: 1, publishedClasses: 1, scheduledRooms: { $size: "$rooms" }, scheduledDepartments: { $size: "$departments" } } },
        ]),
      ]);

    return NextResponse.json({
      metrics: { staff, students, rooms, activeRooms, bookings, pendingBookings, paidOrders: orders, departments, courses, allocations: schedule[0]?.allocations || 0, publishedClasses: schedule[0]?.publishedClasses || 0, scheduledRooms: schedule[0]?.scheduledRooms || 0, scheduledDepartments: schedule[0]?.scheduledDepartments || 0 },
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
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load administration data." },
      { status: 500 }
    );
  }
}
