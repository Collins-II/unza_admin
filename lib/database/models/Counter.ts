import mongoose, { Schema } from "mongoose";

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 },
});

export default mongoose.models.Counter || mongoose.model("Counter", counterSchema);
