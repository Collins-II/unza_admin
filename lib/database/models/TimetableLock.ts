import mongoose, { Schema, type Document } from "mongoose";

export interface ITimetableLock extends Document {
  key: string;
  token: string;
  expiresAt: Date;
}

const timetableLockSchema = new Schema<ITimetableLock>(
  {
    key: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export default mongoose.models.TimetableLock || mongoose.model<ITimetableLock>("TimetableLock", timetableLockSchema);
