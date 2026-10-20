import mongoose, { Schema, type Document } from "mongoose";

export interface IRoom extends Document {
  spaceType?: "lecture_room" | "laboratory" | "seminar_room" | "office" | "library" | "clinic" | "cafeteria" | "residence" | "administrative" | "other";
  name: string;
  code: string;
  building: string;
  floor?: number;
  capacity?: number;
  category: string;
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  latitude: number;
  longitude: number;
  equipment?: string[];
  description?: string;
  isAvailable: boolean;
}

const roomSchema = new Schema<IRoom>(
  {
    spaceType: {
      type: String,
      enum: ["lecture_room", "laboratory", "seminar_room", "office", "library", "clinic", "cafeteria", "residence", "administrative", "other"],
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    building: { type: String, required: true, trim: true },
    floor: { type: Number, default: 0 },
    capacity: { type: Number, default: 0, min: 0 },
    category: { type: String, default: "general", trim: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    equipment: [{ type: String, trim: true }],
    description: { type: String, default: "" },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Optional: 2dsphere index for geospatial querying
roomSchema.index({ location: "2dsphere" });

export default mongoose.models.Room || mongoose.model<IRoom>("Room", roomSchema);