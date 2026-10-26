import mongoose, { Schema, type Document, type Model } from "mongoose";
import { isAcademicDate, validateAcademicTerm, type AcademicTermInput } from "../../academicCalendar.ts";

export interface IAcademicTerm extends Document, AcademicTermInput {
  __v: number;
  createdAt: Date;
  updatedAt: Date;
}

const academicTermSchema = new Schema<IAcademicTerm>({
  academicYear: { type: String, required: true, trim: true, maxlength: 30 },
  semester: { type: String, required: true, trim: true, maxlength: 50 },
  teachingStartDate: { type: String, required: true, validate: isAcademicDate },
  teachingEndDate: { type: String, required: true, validate: isAcademicDate },
  assessmentStartDate: { type: String, required: true, validate: isAcademicDate },
  assessmentEndDate: { type: String, required: true, validate: isAcademicDate },
  status: { type: String, enum: ["draft", "approved", "archived"], required: true, default: "draft" },
}, { timestamps: true, optimisticConcurrency: true });

academicTermSchema.index({ academicYear: 1, semester: 1 }, { unique: true });
academicTermSchema.index({ status: 1, teachingStartDate: 1, teachingEndDate: 1 });
academicTermSchema.pre("validate", function () {
  const error = validateAcademicTerm({
    academicYear: this.academicYear,
    semester: this.semester,
    teachingStartDate: this.teachingStartDate,
    teachingEndDate: this.teachingEndDate,
    assessmentStartDate: this.assessmentStartDate,
    assessmentEndDate: this.assessmentEndDate,
    status: this.status,
  });
  if (error) this.invalidate("teachingStartDate", error);
});

export default (mongoose.models.AcademicTerm as Model<IAcademicTerm> | undefined) ||
  mongoose.model<IAcademicTerm>("AcademicTerm", academicTermSchema);
