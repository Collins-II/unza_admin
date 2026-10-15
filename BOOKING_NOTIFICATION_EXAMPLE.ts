// EXAMPLE: How to integrate notifications into the bookings create route
// Copy this pattern to your existing booking creation endpoint

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import Room from "@/lib/database/models/Room";
import User from "@/lib/database/models/User";
import { notifyBookingConfirmed } from "@/lib/notificationHelpers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, roomId, purpose, startTime, endTime, status } = body;

    if (!userId || !roomId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, roomId" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Get room details for notification
    const room = await Room.findById(roomId);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Get user details for notification
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create booking
    const booking = await Booking.create({
      user: userId,
      room: roomId,
      purpose: purpose || "Campus booking",
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: status || "pending",
    });

    // ✨ NOTIFICATION: Send booking confirmation
    if (status === "confirmed" || status !== "pending") {
      const bookingDate = new Date(startTime).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      const bookingTime = `${new Date(startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} - ${new Date(endTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;

      try {
        await notifyBookingConfirmed(
          userId,
          room.name,
          bookingDate,
          bookingTime,
          booking._id.toString()
        );
        console.log(`Notification sent for booking ${booking._id}`);
      } catch (notifError) {
        // Log error but don't fail the booking creation
        console.error("Failed to send notification:", notifError);
      }
    }

    return NextResponse.json(
      {
        id: booking._id.toString(),
        room: room.name,
        purpose: booking.purpose,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        message: "Booking created successfully",
        notificationSent:
          status === "confirmed" || status !== "pending" ? true : false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating booking:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create booking",
      },
      { status: 500 }
    );
  }
}
