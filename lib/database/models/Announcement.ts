import mongoose, { Schema, type Document } from "mongoose";

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  audience: "all" | "students" | "staff";
  publishedBy?: mongoose.Types.ObjectId;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    audience: { type: String, enum: ["all", "students", "staff"], default: "all", index: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.Announcement || mongoose.model<IAnnouncement>("Announcement", announcementSchema);
