import mongoose, { Schema, type Document } from "mongoose";
import "./Department.ts";
import "./Room.ts";

export interface ICourse extends Document {
  code: string;
  title: string;
  department: mongoose.Types.ObjectId;
  level?: string;
  credits?: number;
  semester?: string;
  expectedEnrollment?: number;
  lecturer?: string;
  sessionsPerWeek?: number;
  sessionMinutes?: number;
  preferredVenues: mongoose.Types.ObjectId[];
  preferredSpaceTypes: ("lecture_room" | "laboratory" | "seminar_room")[];
  active: boolean;
  catalogueOnly?: boolean;
  sourceUrl?: string;
  verifiedAt?: string;
}

const courseSchema = new Schema<ICourse>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    level: { type: String, required(this: ICourse): boolean { return !this.catalogueOnly; }, trim: true },
    credits: { type: Number, required(this: ICourse): boolean { return !this.catalogueOnly; }, min: 1, max: 30 },
    semester: { type: String, required(this: ICourse): boolean { return !this.catalogueOnly; }, trim: true },
    expectedEnrollment: { type: Number, required(this: ICourse): boolean { return !this.catalogueOnly; }, min: 1 },
    lecturer: { type: String, trim: true },
    sessionsPerWeek: { type: Number, default(this: ICourse) { return this.catalogueOnly ? undefined : 2; }, min: 1, max: 6 },
    sessionMinutes: { type: Number, default(this: ICourse) { return this.catalogueOnly ? undefined : 120; }, min: 30, max: 300 },
    preferredVenues: [{ type: Schema.Types.ObjectId, ref: "Room" }],
    preferredSpaceTypes: {
      type: [{ type: String, enum: ["lecture_room", "laboratory", "seminar_room"] }],
      default: ["lecture_room", "laboratory", "seminar_room"],
    },
    active: { type: Boolean, default: true, validate: {
      validator(value: boolean): boolean { return !value || !this.get("catalogueOnly"); },
      message: "Catalogue-only courses cannot be active until scheduling details are supplied.",
    } },
    catalogueOnly: { type: Boolean, default: false, index: true },
    sourceUrl: { type: String, trim: true },
    verifiedAt: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.Course || mongoose.model<ICourse>("Course", courseSchema);
