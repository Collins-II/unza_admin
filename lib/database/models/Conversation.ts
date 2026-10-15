import mongoose, { Schema, type Document } from "mongoose";

export interface IConversation extends Document {
  type: "direct" | "group";
  name?: string;
  members: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  directKey?: string;
  lastMessage?: { text: string; sender: mongoose.Types.ObjectId; createdAt: Date };
  reads: { user: mongoose.Types.ObjectId; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ["direct", "group"], required: true },
    name: { type: String, trim: true, maxlength: 60 },
    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Sorted "idA:idB" so a pair of students only ever has one direct chat
    directKey: { type: String, unique: true, sparse: true },
    lastMessage: {
      text: String,
      sender: { type: Schema.Types.ObjectId, ref: "User" },
      createdAt: Date,
    },
    reads: [{ user: { type: Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now }, _id: false }],
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1, updatedAt: -1 });

export default mongoose.models.Conversation || mongoose.model<IConversation>("Conversation", conversationSchema);
