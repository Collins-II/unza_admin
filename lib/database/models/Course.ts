import mongoose, { Schema, type Document } from "mongoose";

export interface ICourse extends Document {
  code: string;
  title: string;
  department: mongoose.Types.ObjectId;
  level: string;
  credits: number;
  semester: string;
  expectedEnrollment: number;
  lecturer?: string;
  active: boolean;
}

const courseSchema = new Schema<ICourse>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    level: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, min: 1, max: 30 },
    semester: { type: String, required: true, trim: true },
    expectedEnrollment: { type: Number, required: true, min: 1 },
    lecturer: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Course || mongoose.model<ICourse>("Course", courseSchema);
