import mongoose, { Schema } from "mongoose";
import "./User.ts";
import "./Department.ts";

const schema = new Schema({
  kind: { type: String, enum: ["teaching", "assessment"], required: true },
  target: { type: Schema.Types.ObjectId, required: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
  academicYear: { type: String, required: true },
  semester: { type: String, required: true },
  snapshot: { type: String, required: true },
  submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true },
  reason: { type: String, maxlength: 1000 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
}, { timestamps: true });
schema.index({ kind: 1, target: 1, academicYear: 1, semester: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
schema.index({ status: 1, createdAt: -1 });
export default mongoose.models.PublicationRequest || mongoose.model("PublicationRequest", schema);
