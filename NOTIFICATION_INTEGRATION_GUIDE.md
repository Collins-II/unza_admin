# Notification System Integration Guide

This guide shows how to integrate the notification system into your existing API routes and pages.

## Quick Start

### 1. Send a Notification When Booking is Created

**File**: `app/api/bookings/create/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import Room from "@/lib/database/models/Room";
import { notifyBookingConfirmed } from "@/lib/notificationHelpers";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { room, purpose, startTime, endTime } = body;

    await connectToDatabase();

    // Create booking (existing code)
    const roomDoc = await Room.findOne({ name: room });
    const booking = await Booking.create({
      user: session.user.id,
      room: roomDoc._id,
      purpose,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: "confirmed",
    });

    // ✨ NEW: Send notification when booking is created
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

    await notifyBookingConfirmed(
      session.user.id,
      roomDoc.name,
      bookingDate,
      bookingTime,
      booking._id.toString()
    );

    return NextResponse.json(
      {
        id: booking._id.toString(),
        room: roomDoc.name,
        status: "confirmed",
        message: "Booking created and notification sent",
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
```

### 2. Send Payment Notification

**File**: `app/api/commerce/callback/route.ts`

```typescript
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/database";
import CommerceOrder from "@/lib/database/models/CommerceOrder";
import User from "@/lib/database/models/User";
import { notifyPaymentReceived, notifyPaymentFailed } from "@/lib/notificationHelpers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, status, transactionId, amount } = body;

    await connectToDatabase();

    const order = await CommerceOrder.findById(orderId).populate("user");

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (status === "success") {
      // ✨ NEW: Notify user of successful payment
      await notifyPaymentReceived(
        order.user._id.toString(),
        `ZMW ${amount}`,
        transactionId,
        orderId
      );

      order.status = "completed";
      order.transactionId = transactionId;
    } else {
      // ✨ NEW: Notify user of payment failure
      await notifyPaymentFailed(
        order.user._id.toString(),
        `ZMW ${amount}`,
        body.error || "Payment processing failed",
        orderId
      );

      order.status = "failed";
    }

    await order.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing payment callback:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
```

### 3. Show Notification Bell in Dashboard

**File**: `app/dashboard/page.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { useNotifications } from "@/lib/useNotifications";
import { NotificationBell, useToast } from "@/components/notifications";

export default function Dashboard() {
  const { unreadCount, notifications } = useNotifications();
  const toast = useToast();

  // Show toast for new notifications
  useEffect(() => {
    const newNotifications = notifications.filter((n) => !n.isRead);
    if (newNotifications.length > 0) {
      const latest = newNotifications[0];
      toast.info(latest.title, latest.message);
    }
  }, [notifications, toast]);

  return (
    <div>
      {/* Header with notification bell */}
      <header className="flex justify-between items-center p-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <NotificationBell unreadCount={unreadCount} />
      </header>

      {/* Rest of dashboard */}
      <main className="p-4">
        {/* Your dashboard content */}
      </main>
    </div>
  );
}
```

### 4. Add Notification Preferences to Settings

**File**: `components/dashboard/SettingsModal.tsx`

```typescript
import { useState } from "react";
import { X, Loader } from "lucide-react";
import { NotificationPreferencesModal } from "@/components/notifications";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-3">
            <button
              onClick={() => setPreferencesOpen(true)}
              className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Notification Preferences
            </button>

            {/* Other settings */}
          </div>
        </div>
      </div>

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />
    </>
  );
}
```

### 5. Create a Booking Reminder System

**File**: `app/api/bookings/reminders/route.ts` (Run via cron job)

```typescript
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/database";
import Booking from "@/lib/database/models/Booking";
import { notifyBookingReminder } from "@/lib/notificationHelpers";

/**
 * This endpoint should be called periodically (e.g., every 5 minutes)
 * via a cron job (e.g., Vercel Cron Functions or external scheduler)
 */
export async function GET() {
  try {
    await connectToDatabase();

    // Find bookings starting in the next 1-2 hours
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const upcomingBookings = await Booking.find({
      startTime: { $gte: oneHourLater, $lte: twoHoursLater },
      status: "confirmed",
    }).populate("user room");

    let remindersCount = 0;

    for (const booking of upcomingBookings) {
      // Check if reminder was already sent (you might want to add a field to track this)
      const minutesUntil = Math.floor(
        (new Date(booking.startTime).getTime() - now.getTime()) / (60 * 1000)
      );

      if (minutesUntil > 0 && minutesUntil <= 90) {
        // Send reminder
        await notifyBookingReminder(
          booking.user._id.toString(),
          booking.room.name,
          minutesUntil,
          booking._id.toString()
        );

        remindersCount++;
      }
    }

    return NextResponse.json(
      {
        message: `Sent ${remindersCount} booking reminders`,
        count: remindersCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending booking reminders:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminders" },
      { status: 500 }
    );
  }
}
```

### 6. Send System Notifications to All Users

**File**: `app/api/admin/announcements/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/database";
import User from "@/lib/database/models/User";
import { notifySystemAnnouncement } from "@/lib/notificationHelpers";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (session?.user?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { title, message, targetRole } = await request.json();

    await connectToDatabase();

    // Get all users (or filtered by role)
    let query: any = { status: "active" };
    if (targetRole) {
      query.role = targetRole;
    }

    const users = await User.find(query).select("_id");

    // Send notification to all users
    const results = await Promise.allSettled(
      users.map((user) =>
        notifySystemAnnouncement(user._id.toString(), title, message)
      )
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;

    return NextResponse.json(
      {
        message: `Announcement sent to ${successCount} users`,
        totalUsers: users.length,
        successCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending announcement:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send announcement" },
      { status: 500 }
    );
  }
}
```

### 7. View Notifications on a Page

**File**: `app/bookings/page.tsx`

```typescript
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useNotifications } from "@/lib/useNotifications";
import { useToast } from "@/components/notifications";
import { Calendar, Bell } from "lucide-react";

export default function BookingsPage() {
  const { notifications } = useNotifications();
  const toast = useToast();

  // Filter for booking-related notifications
  const bookingNotifications = notifications.filter((n) =>
    n.type.includes("booking")
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">My Bookings</h1>

      {/* Show recent booking notifications */}
      {bookingNotifications.length > 0 && (
        <div className="my-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="font-semibold text-blue-900 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Recent Booking Updates
          </h2>
          <div className="mt-2 space-y-2">
            {bookingNotifications.slice(0, 3).map((notif) => (
              <div
                key={notif.id}
                className="p-2 bg-white rounded border border-blue-100"
              >
                <p className="font-medium text-sm">{notif.title}</p>
                <p className="text-xs text-gray-600">{notif.message}</p>
              </div>
            ))}
          </div>
          <Link
            href="/notifications"
            className="text-xs text-blue-600 hover:text-blue-800 mt-2 inline-block"
          >
            View all →
          </Link>
        </div>
      )}

      {/* Rest of bookings page */}
    </div>
  );
}
```

## Usage Summary

### In API Routes (Server)

```typescript
// Import helpers
import {
  notifyBookingConfirmed,
  notifyPaymentReceived,
  notifySystemAlert,
} from "@/lib/notificationHelpers";

// Use in your route handler
await notifyBookingConfirmed(userId, roomName, date, time, bookingId);
```

### In React Components (Client)

```typescript
// Import hook
import { useNotifications } from "@/lib/useNotifications";
import { useToast } from "@/components/notifications";

// Use in component
const { unreadCount, notifications } = useNotifications();
const toast = useToast();

// Show toast
toast.success("Booking confirmed!");
```

### In Layout

```typescript
// app/providers.tsx
import { ToastProvider } from "@/components/notifications";

export function Providers({ children }) {
  return <ToastProvider>{children}</ToastProvider>;
}
```

## Next Steps

1. **Integration**: Update your booking, payment, and other API routes to send notifications
2. **Testing**: Create test bookings/payments and verify notifications appear
3. **Customization**: Adjust notification types, colors, and messages to match your brand
4. **Enhancements**: Add email/SMS integration, push notifications, or WebSocket support

For full API documentation, see [NOTIFICATION_SYSTEM.md](./NOTIFICATION_SYSTEM.md)
