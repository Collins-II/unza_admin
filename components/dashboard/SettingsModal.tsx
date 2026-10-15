"use client";

import { FormEvent, useState } from "react";
import { Bell, Shield, SlidersHorizontal, X } from "lucide-react";

type NotificationSettings = {
  email: boolean;
  sms: boolean;
  push: boolean;
  weeklyDigest: boolean;
};

type AppSettings = {
  compactMode: boolean;
  campusAlerts: boolean;
  autoConfirmBookings: boolean;
  darkMode: boolean;
};

type SettingsState = {
  notifications: NotificationSettings;
  app: AppSettings;
};

type SettingsModalProps = {
  open: boolean;
  settings: SettingsState | null;
  onClose: () => void;
  onSaved: () => void;
};

export function SettingsModal({ open, settings, onClose, onSaved }: SettingsModalProps) {
  const [form, setForm] = useState<SettingsState>(() => ({
    notifications: settings?.notifications || { email: true, sms: false, push: true, weeklyDigest: true },
    app: settings?.app || { compactMode: false, campusAlerts: true, autoConfirmBookings: false, darkMode: true },
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return null;
  }

  const toggleNotification = (key: keyof NotificationSettings) => {
    setForm((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: !current.notifications[key] },
    }));
  };

  const toggleAppSetting = (key: keyof AppSettings) => {
    setForm((current) => ({
      ...current,
      app: { ...current.app, [key]: !current.app[key] },
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Unable to save settings.");
      }

      onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save settings.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ui-modal-backdrop">
      <div className="w-full max-w-2xl ui-modal">
        <div className="ui-modal-head mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#008236]">Settings</p>
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight text-black">Account preferences</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-black text-black transition hover:bg-black hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <Bell className="h-3.5 w-3.5" />
              Notifications
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["email", "Email updates"],
                ["sms", "SMS reminders"],
                ["push", "Push alerts"],
                ["weeklyDigest", "Weekly digest"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleNotification(key as keyof NotificationSettings)}
                  className={`flex items-center justify-between min-h-[52px] rounded border-2 px-3 py-2.5 text-left text-sm font-bold transition ${
                    form.notifications[key as keyof NotificationSettings]
                      ? "border-black bg-white text-black"
                      : "border-gray-200 bg-white text-gray-500"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`h-6 w-11 shrink-0 rounded-full p-1.5 ${form.notifications[key as keyof NotificationSettings] ? "bg-[#008236]" : "bg-gray-300"}`}>
                    <span className={`block h-3 w-3 rounded-full bg-white transition ${form.notifications[key as keyof NotificationSettings] ? "translate-x-5" : "translate-x-0"}`} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Interface & campus
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["compactMode", "Compact layout"],
                ["campusAlerts", "Campus alerts"],
                ["autoConfirmBookings", "Auto-confirm bookings"],
                ["darkMode", "Dark mode"]
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleAppSetting(key as keyof AppSettings)}
                  className={`flex items-center justify-between min-h-[52px] rounded border-2 px-3 py-2.5 text-left text-sm font-bold transition ${
                    form.app[key as keyof AppSettings]
                      ? "border-black bg-white text-black"
                      : "border-gray-200 bg-white text-gray-500"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`h-6 w-11 shrink-0 rounded-full p-1.5 ${form.app[key as keyof AppSettings] ? "bg-[#008236]" : "bg-gray-300"}`}>
                    <span className={`block h-3 w-3 rounded-full bg-white transition ${form.app[key as keyof AppSettings] ? "translate-x-5" : "translate-x-0"}`} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border-2 border-gray-200 bg-white p-4 text-sm text-gray-600">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <Shield className="h-3.5 w-3.5" />
              Security
            </div>
            Two-factor authentication is available for your account. The setting remains managed securely from your identity provider and can be reviewed in the admin portal.
          </div>

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
              {isSubmitting ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
