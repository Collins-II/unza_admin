import { notificationTemplates } from "@/lib/notifications";
import type { NotificationPayload } from "@/lib/notifications";

/**
 * Creates a notification for a user
 * This function should be called from API routes or server actions
 */
export async function createNotification(
  userId: string,
  payload: Omit<NotificationPayload, "userId">
): Promise<Response> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/notifications`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          userId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create notification: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Helper to create a booking confirmed notification
 */
export async function notifyBookingConfirmed(
  userId: string,
  roomName: string,
  date: string,
  time: string,
  bookingId?: string
) {
  const payload = notificationTemplates.bookingConfirmed(roomName, date, time);
  payload.userId = userId;
  if (bookingId) {
    payload.relatedId = { ...payload.relatedId, bookingId };
  }
  payload.actionUrl = `/booking/${bookingId}`;
  return createNotification(userId, payload);
}

/**
 * Helper to create a booking cancelled notification
 */
export async function notifyBookingCancelled(
  userId: string,
  roomName: string,
  reason?: string,
  bookingId?: string
) {
  const payload = notificationTemplates.bookingCancelled(roomName, reason);
  payload.userId = userId;
  if (bookingId) {
    payload.relatedId = { ...payload.relatedId, bookingId };
  }
  return createNotification(userId, payload);
}

/**
 * Helper to create a booking reminder notification
 */
export async function notifyBookingReminder(
  userId: string,
  roomName: string,
  minutesUntil: number,
  bookingId?: string
) {
  const payload = notificationTemplates.bookingReminder(roomName, minutesUntil);
  payload.userId = userId;
  if (bookingId) {
    payload.relatedId = { ...payload.relatedId, bookingId };
  }
  payload.actionUrl = `/booking/${bookingId}`;
  return createNotification(userId, payload);
}

/**
 * Helper to create a room available notification
 */
export async function notifyRoomAvailable(
  userId: string,
  roomName: string,
  price?: string,
  roomId?: string
) {
  const payload = notificationTemplates.roomAvailable(roomName, price);
  payload.userId = userId;
  if (roomId) {
    payload.relatedId = { ...payload.relatedId, roomId };
  }
  payload.actionUrl = `/booking?room=${roomId}`;
  return createNotification(userId, payload);
}

/**
 * Helper to create a payment received notification
 */
export async function notifyPaymentReceived(
  userId: string,
  amount: string,
  transactionId: string,
  orderId?: string
) {
  const payload = notificationTemplates.paymentReceived(amount, transactionId);
  payload.userId = userId;
  if (orderId) {
    payload.relatedId = { ...payload.relatedId, orderId };
  }
  payload.actionUrl = `/dashboard/payments`;
  return createNotification(userId, payload);
}

/**
 * Helper to create a payment failed notification
 */
export async function notifyPaymentFailed(
  userId: string,
  amount: string,
  reason: string,
  orderId?: string
) {
  const payload = notificationTemplates.paymentFailed(amount, reason);
  payload.userId = userId;
  if (orderId) {
    payload.relatedId = { ...payload.relatedId, orderId };
  }
  payload.actionUrl = `/dashboard/payments`;
  return createNotification(userId, payload);
}

/**
 * Helper to create a payment reminder notification
 */
export async function notifyPaymentReminder(
  userId: string,
  amount: string,
  daysUntil: number,
  orderId?: string
) {
  const payload = notificationTemplates.paymentReminder(amount, daysUntil);
  payload.userId = userId;
  if (orderId) {
    payload.relatedId = { ...payload.relatedId, orderId };
  }
  payload.actionUrl = `/dashboard/payments`;
  return createNotification(userId, payload);
}

/**
 * Helper to create a system alert notification
 */
export async function notifySystemAlert(
  userId: string,
  title: string,
  message: string
) {
  const payload = notificationTemplates.systemAlert(title, message);
  payload.userId = userId;
  return createNotification(userId, payload);
}

/**
 * Helper to create a system maintenance notification
 */
export async function notifySystemMaintenance(
  userId: string,
  startTime: string,
  endTime: string,
  message?: string
) {
  const payload = notificationTemplates.systemMaintenance(startTime, endTime, message);
  payload.userId = userId;
  return createNotification(userId, payload);
}

/**
 * Helper to create a system announcement notification
 */
export async function notifySystemAnnouncement(
  userId: string,
  title: string,
  message: string
) {
  const payload = notificationTemplates.systemAnnouncement(title, message);
  payload.userId = userId;
  return createNotification(userId, payload);
}

/**
 * Helper to create a user message notification
 */
export async function notifyUserMessage(
  userId: string,
  senderName: string,
  message: string
) {
  const payload = notificationTemplates.userMessage(senderName, message);
  payload.userId = userId;
  return createNotification(userId, payload);
}

/**
 * Helper to create a room release soon notification
 */
export async function notifyRoomReleaseSoon(
  userId: string,
  roomName: string,
  minutesUntil: number,
  bookingId?: string
) {
  const payload = notificationTemplates.roomReleaseSoon(roomName, minutesUntil);
  payload.userId = userId;
  if (bookingId) {
    payload.relatedId = { ...payload.relatedId, bookingId };
  }
  payload.actionUrl = `/booking/${bookingId}`;
  return createNotification(userId, payload);
}
