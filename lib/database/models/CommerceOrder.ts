import mongoose, { Schema, type Document } from "mongoose";

export type CommerceOrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface ICommerceOrder extends Document {
  user: mongoose.Types.ObjectId;
  reference: string;
  itemName: string;
  itemType: "campus-service" | "booking" | "merchandise";
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  status: CommerceOrderStatus;
  dpoToken?: string;
  dpoTransactionId?: string;
  dpoResult?: string;
  paidAt?: Date;
}

const commerceOrderSchema = new Schema<ICommerceOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reference: { type: String, required: true, unique: true, index: true },
    itemName: { type: String, required: true, trim: true },
    itemType: { type: String, enum: ["campus-service", "booking", "merchandise"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    customerEmail: { type: String, required: true, lowercase: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "paid", "failed", "cancelled"], default: "pending", index: true },
    dpoToken: { type: String, index: true, sparse: true },
    dpoTransactionId: String,
    dpoResult: String,
    paidAt: Date,
  },
  { timestamps: true }
);

export default mongoose.models.CommerceOrder || mongoose.model<ICommerceOrder>("CommerceOrder", commerceOrderSchema);