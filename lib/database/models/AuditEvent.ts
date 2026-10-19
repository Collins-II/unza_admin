import mongoose, { Schema } from "mongoose";

const auditEventSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: { type: String, required: true, index: true },
  target: { type: String, required: true },
  details: { type: Map, of: String },
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

export default mongoose.models.AuditEvent || mongoose.model("AuditEvent", auditEventSchema);
