"use client";

import { FormEvent, useState } from "react";
import { CreditCard, ShieldCheck, X } from "lucide-react";

type PaymentInfo = {
  paymentMethod: "card" | "mobile-money" | "bank-transfer";
  provider: string;
  billingEmail: string;
  cardholderName: string;
  last4: string;
  status: "verified" | "pending" | "inactive";
};

type PaymentModalProps = {
  open: boolean;
  payment: PaymentInfo | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PaymentModal({ open, payment, onClose, onSaved }: PaymentModalProps) {
  const [form, setForm] = useState<PaymentInfo>(() => ({
    paymentMethod: payment?.paymentMethod || "card",
    provider: payment?.provider || "Visa",
    billingEmail: payment?.billingEmail || "",
    cardholderName: payment?.cardholderName || "",
    last4: payment?.last4 || "",
    status: payment?.status || "verified",
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/dashboard/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: form.paymentMethod,
          provider: form.provider,
          billingEmail: form.billingEmail,
          cardholderName: form.cardholderName,
          last4: form.last4,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Unable to save payment details.");
      }

      onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save payment details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ui-modal-backdrop">
      <div className="w-full max-w-xl ui-modal">
        <div className="ui-modal-head mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#008236]">Payment</p>
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight text-black">Billing details</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-black text-black transition hover:bg-black hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
                <CreditCard className="h-3.5 w-3.5" />
                Payment method
              </span>
              <select
                value={form.paymentMethod}
                onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value as PaymentInfo["paymentMethod"] }))}
                className="ui-input"
              >
                <option value="card">Card</option>
                <option value="mobile-money">Mobile money</option>
                <option value="bank-transfer">Bank transfer</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Provider
              </span>
              <input
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                className="ui-input"
                placeholder="Visa / Airtel Money / Standard Bank"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <CreditCard className="h-3.5 w-3.5" />
              Billing email
            </span>
            <input
              type="email"
              value={form.billingEmail}
              onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))}
              className="ui-input"
              placeholder="billing@campus.example"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              Cardholder name
            </span>
            <input
              value={form.cardholderName}
              onChange={(event) => setForm((current) => ({ ...current, cardholderName: event.target.value }))}
              className="ui-input"
              placeholder="Student name"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <CreditCard className="h-3.5 w-3.5" />
              Last 4 digits
            </span>
            <input
              value={form.last4}
              maxLength={4}
              onChange={(event) => setForm((current) => ({ ...current, last4: event.target.value.replace(/\D/g, "").slice(0, 4) }))}
              className="ui-input"
              placeholder="1234"
            />
          </label>

          {error ? (
            <div className="rounded border-2 border-[#008236] bg-white px-3 py-2 text-sm font-semibold text-[#016630]">
              {error}
            </div>
          ) : null}

          <div className="ui-modal-actions">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="ui-btn ui-btn-primary">
              {isSubmitting ? "Saving..." : "Save payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
