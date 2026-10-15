import mongoose, { Schema, type Document } from "mongoose";

export type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
export type AllocationStatus = "draft" | "published" | "cancelled";

export interface ITimetableAllocation extends Document {
  academicYear: string;
  semester: string;
  department: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  cohort: string;
  lecturer?: string;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
  status: AllocationStatus;
  notes?: string;
}

const timetableAllocationSchema = new Schema<ITimetableAllocation>(
  {
    academicYear: { type: String, required: true, trim: true, index: true },
    semester: { type: String, required: true, trim: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    cohort: { type: String, required: true, trim: true },
    lecturer: { type: String, trim: true },
    dayOfWeek: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      required: true,
      index: true,
    },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    status: { type: String, enum: ["draft", "published", "cancelled"], default: "draft", index: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

timetableAllocationSchema.index({ academicYear: 1, semester: 1, room: 1, dayOfWeek: 1, startTime: 1 });
timetableAllocationSchema.index({ academicYear: 1, semester: 1, cohort: 1, dayOfWeek: 1, startTime: 1 });

export default mongoose.models.TimetableAllocation ||
  mongoose.model<ITimetableAllocation>("TimetableAllocation", timetableAllocationSchema);
