import { NextResponse } from "next/server";

import { requireAdminRole, departmentScope, departmentDenied, studentDepartmentScope } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import Room from "@/lib/database/models/Room";
import User from "@/lib/database/models/User";
import Course from "@/lib/database/models/Course";
import Department from "@/lib/database/models/Department";
import TimetableAllocation from "@/lib/database/models/TimetableAllocation";
import mongoose from "mongoose";

export async function GET(request: Request) {
  const access = await requireAdminRole({ departmental: true });
  if (access.response) return access.response;

  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const department = params.get("department");
    if (department && !mongoose.isValidObjectId(department)) return NextResponse.json({ error: "Invalid department filter." }, { status: 400 });
    if (department) {
      const denied = departmentDenied(access.session.user, department);
      if (denied) return denied;
    }
    const isAdmin = access.session.user.role === "admin";
    const departmentFilter = department ? { department: new mongoose.Types.ObjectId(department) } : {
      ...(isAdmin ? {} : { department: { $in: (access.session.user.departmentIds || []).map((id: string) => new mongoose.Types.ObjectId(id)) } }),
    };
    const term = {
      academicYear: params.get("academicYear") || "2026/2027", semester: params.get("semester") || "Semester 1",
      ...departmentFilter, status: { $ne: "cancelled" },
    };
    const [staff, students, rooms, activeRooms, bookings, pendingBookings, departments, courses, schedule] =
      await Promise.all([
        isAdmin ? User.countDocuments({ role: { $in: ["staff", "admin"] } }) : Promise.resolve(0),
        User.countDocuments({ role: "student", status: "active", ...await studentDepartmentScope(access.session.user) }),
        Room.countDocuments(),
        Room.countDocuments({ isAvailable: true }),
        isAdmin ? Booking.countDocuments() : Promise.resolve(0),
        isAdmin ? Booking.countDocuments({ status: "pending" }) : Promise.resolve(0),
        Department.countDocuments(isAdmin ? {} : { _id: { $in: access.session.user.departmentIds || [] } }),
        Course.countDocuments({ active: true, ...departmentScope(access.session.user) }),
        TimetableAllocation.aggregate([
          { $match: term },
          { $group: { _id: null, allocations: { $sum: 1 }, publishedClasses: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } }, rooms: { $addToSet: "$room" }, departments: { $addToSet: "$department" } } },
          { $project: { _id: 0, allocations: 1, publishedClasses: 1, scheduledRooms: { $size: "$rooms" }, scheduledDepartments: { $size: "$departments" } } },
        ]),
      ]);

    return NextResponse.json({
      metrics: { staff, students, rooms, activeRooms, bookings, pendingBookings, departments, courses, allocations: schedule[0]?.allocations || 0, publishedClasses: schedule[0]?.publishedClasses || 0, scheduledRooms: schedule[0]?.scheduledRooms || 0, scheduledDepartments: schedule[0]?.scheduledDepartments || 0 },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load administration data." },
      { status: 500 }
    );
  }
}
