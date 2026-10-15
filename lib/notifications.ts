import type { NotificationType, NotificationPriority } from "@/lib/database/models/Notification";

export type { NotificationType, NotificationPriority };

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  description?: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  relatedId?: {
    bookingId?: string;
    roomId?: string;
    orderId?: string;
  };
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface NotificationResponse {
  id: string;
  user: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  description?: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  relatedId?: {
    bookingId?: string;
    roomId?: string;
    orderId?: string;
  };
  isRead: boolean;
  readAt?: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Icon mapping for notification types
export const notificationIconMap: Record<NotificationType, string> = {
  booking_confirmed: "CheckCircle",
  booking_cancelled: "XCircle",
  booking_reminder: "Clock",
  room_available: "DoorOpen",
  payment_received: "DollarSign",
  payment_failed: "AlertCircle",
  payment_reminder: "AlertTriangle",
  system_alert: "AlertTriangle",
  system_maintenance: "Wrench",
  system_announcement: "Megaphone",
  user_message: "MessageSquare",
  room_release_soon: "Clock",
};

// Color mapping for notification types (Tailwind classes)
export const notificationColorMap: Record<NotificationType, string> = {
  booking_confirmed: "bg-green-50 text-green-800 border-green-200",
  booking_cancelled: "bg-red-50 text-red-800 border-red-200",
  booking_reminder: "bg-blue-50 text-blue-800 border-blue-200",
  room_available: "bg-emerald-50 text-emerald-800 border-emerald-200",
  payment_received: "bg-green-50 text-green-800 border-green-200",
  payment_failed: "bg-red-50 text-red-800 border-red-200",
  payment_reminder: "bg-yellow-50 text-yellow-800 border-yellow-200",
  system_alert: "bg-amber-50 text-amber-800 border-amber-200",
  system_maintenance: "bg-purple-50 text-purple-800 border-purple-200",
  system_announcement: "bg-blue-50 text-blue-800 border-blue-200",
  user_message: "bg-gray-50 text-gray-800 border-gray-200",
  room_release_soon: "bg-yellow-50 text-yellow-800 border-yellow-200",
};

// Badge color for priority levels
export const priorityColorMap: Record<NotificationPriority, string> = {
  low: "bg-gray-200 text-gray-800",
  normal: "bg-blue-200 text-blue-800",
  high: "bg-orange-200 text-orange-800",
  urgent: "bg-red-200 text-red-800",
};

// Template generators for common notifications
export const notificationTemplates = {
  bookingConfirmed: (roomName: string, date: string, time: string): NotificationPayload => ({
    userId: "", // Will be set by caller
    type: "booking_confirmed",
    priority: "high",
    title: "Booking Confirmed",
    message: `Your booking for ${roomName} is confirmed`,
    description: `Date: ${date}, Time: ${time}`,
    actionLabel: "View Booking",
  }),

  bookingCancelled: (roomName: string, reason?: string): NotificationPayload => ({
    userId: "",
    type: "booking_cancelled",
    priority: "high",
    title: "Booking Cancelled",
    message: `Your booking for ${roomName} has been cancelled`,
    description: reason ? `Reason: ${reason}` : undefined,
    actionLabel: "View Details",
  }),

  bookingReminder: (roomName: string, minutesUntil: number): NotificationPayload => ({
    userId: "",
    type: "booking_reminder",
    priority: "normal",
    title: "Booking Reminder",
    message: `Your booking at ${roomName} starts in ${minutesUntil} minutes`,
    actionLabel: "View Booking",
  }),

  roomAvailable: (roomName: string, price?: string): NotificationPayload => ({
    userId: "",
    type: "room_available",
    priority: "normal",
    title: "Room Available",
    message: `${roomName} is now available for booking${price ? ` at ${price}` : ""}`,
    actionLabel: "Book Now",
  }),

  paymentReceived: (amount: string, transactionId: string): NotificationPayload => ({
    userId: "",
    type: "payment_received",
    priority: "high",
    title: "Payment Received",
    message: `Payment of ${amount} has been received`,
    description: `Transaction ID: ${transactionId}`,
    actionLabel: "View Receipt",
  }),

  paymentFailed: (amount: string, reason: string): NotificationPayload => ({
    userId: "",
    type: "payment_failed",
    priority: "urgent",
    title: "Payment Failed",
    message: `Payment of ${amount} could not be processed`,
    description: `Reason: ${reason}`,
    actionLabel: "Retry Payment",
  }),

  paymentReminder: (amount: string, daysUntil: number): NotificationPayload => ({
    userId: "",
    type: "payment_reminder",
    priority: "high",
    title: "Payment Due",
    message: `Payment of ${amount} is due in ${daysUntil} days`,
    actionLabel: "Pay Now",
  }),

  systemAlert: (title: string, message: string): NotificationPayload => ({
    userId: "",
    type: "system_alert",
    priority: "urgent",
    title,
    message,
  }),

  systemMaintenance: (startTime: string, endTime: string, message?: string): NotificationPayload => ({
    userId: "",
    type: "system_maintenance",
    priority: "high",
    title: "Maintenance Scheduled",
    message: `System maintenance from ${startTime} to ${endTime}`,
    description: message,
  }),

  systemAnnouncement: (title: string, message: string): NotificationPayload => ({
    userId: "",
    type: "system_announcement",
    priority: "normal",
    title,
    message,
  }),

  userMessage: (senderName: string, message: string): NotificationPayload => ({
    userId: "",
    type: "user_message",
    priority: "normal",
    title: `Message from ${senderName}`,
    message,
    actionLabel: "Reply",
  }),

  roomReleaseSoon: (roomName: string, minutesUntil: number): NotificationPayload => ({
    userId: "",
    type: "room_release_soon",
    priority: "normal",
    title: "Release Room Soon",
    message: `${roomName} needs to be released in ${minutesUntil} minutes`,
    actionLabel: "Extend or Release",
  }),
};

// Helper to format notification time
export const formatNotificationTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(date).toLocaleDateString();
};

// Helper to check if notification should be shown as new
export const isNewNotification = (createdAt: Date, maxMinutes = 5): boolean => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(createdAt).getTime();
  return diffMs < maxMinutes * 60000;
};
