import mongoose, { Schema, type Document } from "mongoose";
import "./Department.ts";
import "./Course.ts";
import "./Room.ts";
import "./User.ts";
import { validateTimeRange } from "../../assessmentValidation.ts";

export interface IAssessmentAllocation extends Document {
  academicYear: string;
  semester: string;
  department: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  date: string;
  startTime: string;
  endTime: string;
  room: mongoose.Types.ObjectId;
  title: string;
  assessmentType: "exam" | "test" | "quiz";
  status: "draft" | "published" | "cancelled";
  studentIds: mongoose.Types.ObjectId[];
  invigilatorIds: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  preparedBy?: mongoose.Types.ObjectId[];
}

const assessmentAllocationSchema = new Schema<IAssessmentAllocation>(
  {
    academicYear: { type: String, required: true, trim: true, maxlength: 30, index: true },
    semester: { type: String, required: true, trim: true, maxlength: 50, index: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    startTime: { type: String, required: true, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    assessmentType: { type: String, enum: ["exam", "test", "quiz"], required: true, index: true },
    status: { type: String, enum: ["draft", "published", "cancelled"], required: true, default: "draft", index: true },
    studentIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    invigilatorIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    preparedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

assessmentAllocationSchema.index({ date: 1, startTime: 1, endTime: 1, status: 1 });
assessmentAllocationSchema.index({ academicYear: 1, semester: 1, department: 1, date: 1 });

assessmentAllocationSchema.pre("validate", function () {
  if (!validateTimeRange(this.date, this.startTime, this.endTime)) {
    this.invalidate("date", "A real date and an ordered same-day time range are required.");
  }
  for (const field of ["studentIds", "invigilatorIds"] as const) {
    const ids = this[field].map(String);
    if (!ids.length || new Set(ids).size !== ids.length) {
      this.invalidate(field, "Assignments must contain at least one distinct account.");
    }
  }
});

export default mongoose.models.AssessmentAllocation ||
  mongoose.model<IAssessmentAllocation>("AssessmentAllocation", assessmentAllocationSchema);
