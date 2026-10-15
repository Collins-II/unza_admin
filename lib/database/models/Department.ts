import mongoose, { Schema, type Document } from "mongoose";

export interface IDepartment extends Document {
  code: string;
  name: string;
  faculty: string;
  headOfDepartment?: string;
  active: boolean;
}

const departmentSchema = new Schema<IDepartment>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    faculty: { type: String, required: true, trim: true },
    headOfDepartment: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Department || mongoose.model<IDepartment>("Department", departmentSchema);
