import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
  studentId: string;
  name: string;
  email: string;
  password?: string;
  role: "staff" | "admin";
  department?: string;
  program?: string;
  year?: string;
  phone?: string;
  status?: "active" | "pending" | "inactive";
  paymentMethod?: "card" | "mobile-money" | "bank-transfer";
  paymentProvider?: string;
  billingEmail?: string;
  cardholderName?: string;
  last4?: string;
  paymentStatus?: "verified" | "pending" | "inactive";
  notifications?: {
    email: boolean;
    sms: boolean;
    push: boolean;
    weeklyDigest: boolean;
  };
  appSettings?: {
    compactMode: boolean;
    campusAlerts: boolean;
    autoConfirmBookings: boolean;
    darkMode: boolean;
  };
  bootstrapKey?: string;
}

const userSchema = new Schema<IUser>(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["staff", "admin"],
      default: "staff",
    },
    department: { type: String, trim: true },
    program: { type: String, trim: true },
    year: { type: String, trim: true },
    phone: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "pending", "inactive"],
      default: "active",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "mobile-money", "bank-transfer"],
      default: "card",
    },
    paymentProvider: { type: String, trim: true, default: "Visa" },
    billingEmail: { type: String, trim: true },
    cardholderName: { type: String, trim: true },
    last4: { type: String, trim: true },
    paymentStatus: {
      type: String,
      enum: ["verified", "pending", "inactive"],
      default: "verified",
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: true },
    },
    appSettings: {
      compactMode: { type: Boolean, default: false },
      campusAlerts: { type: Boolean, default: true },
      autoConfirmBookings: { type: Boolean, default: false },
      darkMode: { type: Boolean, default: true },
    },
    bootstrapKey: { type: String, unique: true, sparse: true, select: false },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>("User", userSchema);
