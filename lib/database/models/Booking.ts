import mongoose, { Schema, type Document } from "mongoose";
import type { TutorialGroupDetails } from "../../bookingPolicy.ts";

export interface IBooking extends Document {
  user: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  purpose: string;
  title?: string;
  attendees?: number;
  tutorialGroup?: TutorialGroupDetails;
  conversation?: mongoose.Types.ObjectId | null;
  requestedAt?: Date;
  createdAt: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  startTime: Date;
  endTime: Date;
  status: "pending" | "confirmed" | "cancelled";
  cancellationReason?: "student_cancelled" | "staff_cancelled" | "timetable_conflict";
}

const bookingSchema = new Schema<IBooking>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    purpose: { type: String, required: true, trim: true },
    title: { type: String, trim: true, maxlength: 120 },
    attendees: { type: Number, min: 1 },
    tutorialGroup: {
      type: new Schema({
        groupName: { type: String, required: true, trim: true, maxlength: 120 },
        courseCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
        topic: { type: String, required: true, trim: true, maxlength: 1000 },
        leaderName: { type: String, required: true, trim: true, maxlength: 120 },
      }, { _id: false }),
    },
    conversation: { type: Schema.Types.ObjectId, default: null },
    requestedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
    cancellationReason: {
      type: String,
      enum: ["student_cancelled", "staff_cancelled", "timetable_conflict"],
    },
  },
  { timestamps: true }
);

bookingSchema.index({ room: 1, status: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ user: 1, status: 1, startTime: 1, endTime: 1 });

export default mongoose.models.Booking || mongoose.model<IBooking>("Booking", bookingSchema);
