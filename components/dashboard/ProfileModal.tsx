"use client";

import { FormEvent, useState } from "react";
import { Mail, Phone, User, X } from "lucide-react";

type Profile = {
  id?: string;
  name: string;
  email: string;
  studentId: string;
  phone?: string;
  department?: string;
  program?: string;
  year?: string;
};

type ProfileModalProps = {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ProfileModal({ open, profile, onClose, onSaved }: ProfileModalProps) {
  const [form, setForm] = useState<Profile>(() => ({
    id: profile?.id,
    name: profile?.name || "",
    email: profile?.email || "",
    studentId: profile?.studentId || "",
    phone: profile?.phone || "",
    department: profile?.department || "",
    program: profile?.program || "",
    year: profile?.year || "",
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
      const response = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          department: form.department,
          program: form.program,
          year: form.year,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Unable to update profile.");
      }

      onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ui-modal-backdrop">
      <div className="w-full max-w-2xl ui-modal">
        <div className="ui-modal-head mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#008236]">Profile</p>
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight text-black">Edit student profile</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-black text-black transition hover:bg-black hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <User className="h-3.5 w-3.5" />
              Full name
            </span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="ui-input"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <Mail className="h-3.5 w-3.5" />
              Email
            </span>
            <input
              value={form.email}
              disabled
              className="ui-input !bg-gray-100 text-gray-600"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <User className="h-3.5 w-3.5" />
              Student ID
            </span>
            <input
              value={form.studentId}
              disabled
              className="ui-input !bg-gray-100 text-gray-600"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <Phone className="h-3.5 w-3.5" />
              Phone
            </span>
            <input
              value={form.phone || ""}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              className="ui-input"
              placeholder="+260971234567"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <User className="h-3.5 w-3.5" />
              Department
            </span>
            <input
              value={form.department || ""}
              onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
              className="ui-input"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <User className="h-3.5 w-3.5" />
              Program
            </span>
            <input
              value={form.program || ""}
              onChange={(event) => setForm((current) => ({ ...current, program: event.target.value }))}
              className="ui-input"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <User className="h-3.5 w-3.5" />
              Year
            </span>
            <input
              value={form.year || ""}
              onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
              className="ui-input"
              placeholder="2026"
            />
          </label>

          {error ? (
            <div className="md:col-span-2 rounded border-2 border-[#008236] bg-white px-3 py-2 text-sm font-semibold text-[#016630]">
              {error}
            </div>
          ) : null}

          <div className="md:col-span-2 ui-modal-actions">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="ui-btn ui-btn-primary">
              {isSubmitting ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
