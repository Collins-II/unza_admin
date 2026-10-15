import mongoose, { Schema, type Document } from "mongoose";

export type NotificationType = 
  | "booking_confirmed" 
  | "booking_cancelled" 
  | "booking_reminder" 
  | "room_available" 
  | "payment_received" 
  | "payment_failed" 
  | "payment_reminder"
  | "system_alert" 
  | "system_maintenance"
  | "system_announcement"
  | "user_message"
  | "room_release_soon";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  description?: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  relatedId?: {
    bookingId?: mongoose.Types.ObjectId;
    roomId?: mongoose.Types.ObjectId;
    orderId?: mongoose.Types.ObjectId;
  };
  isRead: boolean;
  readAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "booking_confirmed",
        "booking_cancelled",
        "booking_reminder",
        "room_available",
        "payment_received",
        "payment_failed",
        "payment_reminder",
        "system_alert",
        "system_maintenance",
        "system_announcement",
        "user_message",
        "room_release_soon",
      ],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      default: null,
    },
    actionUrl: {
      type: String,
      default: null,
    },
    actionLabel: {
      type: String,
      default: "View Details",
      trim: true,
    },
    relatedId: {
      bookingId: {
        type: Schema.Types.ObjectId,
        ref: "Booking",
        default: null,
      },
      roomId: {
        type: Schema.Types.ObjectId,
        ref: "Room",
        default: null,
      },
      orderId: {
        type: Schema.Types.ObjectId,
        ref: "CommerceOrder",
        default: null,
      },
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => {
        const date = new Date();
        date.setDate(date.getDate() + 30); // Default 30 days
        return date;
      },
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
notificationSchema.index({ user: 1, isRead: 1, isDeleted: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

// TTL index to auto-delete expired notifications after 30 days
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", notificationSchema);
