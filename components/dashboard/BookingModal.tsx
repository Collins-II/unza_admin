"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, X } from "lucide-react";

import { RoomAvailabilityStatus, RoomStatusBadge } from "@/components/dashboard/RoomAvailabilityStatus";

type RoomOption = {
  id: string;
  name: string;
  code: string;
  floor: string;
  capacity: number;
  isAvailable?: boolean;
};

type BookingFormState = {
  purpose: string;
  room: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed" | "cancelled";
};

type BookingModalProps = {
  open: boolean;
  onClose: () => void;
  rooms: RoomOption[];
  booking?: {
    id: string;
    purpose: string;
    room: string;
    date: string;
    startTime: string;
    endTime: string;
    status: "pending" | "confirmed" | "cancelled";
  } | null;
  defaultRoomName?: string;
  onSaved: () => void;
};

const getLocalDateKey = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const defaultForm = (roomName = ""): BookingFormState => ({
  purpose: "",
  room: roomName,
  date: getLocalDateKey(new Date()),
  startTime: "09:00",
  endTime: "10:30",
  status: "pending",
});

export function BookingModal({ open, onClose, rooms, booking, defaultRoomName, onSaved }: BookingModalProps) {
  const getInitialForm = () => {
    if (booking) {
      return {
        purpose: booking.purpose,
        room: booking.room,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
      } satisfies BookingFormState;
    }

    const initialRoom = defaultRoomName && rooms.some((room) => room.name === defaultRoomName)
      ? defaultRoomName
      : rooms[0]?.name || "";

    return defaultForm(initialRoom);
  };

  const [form, setForm] = useState<BookingFormState>(getInitialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const roomOptions = rooms;
  const selectedRoom = useMemo(
    () => roomOptions.find((room) => room.name === form.room) ?? roomOptions[0],
    [form.room, roomOptions]
  );

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const startDate = new Date(`${form.date}T${form.startTime}:00`);
      const endDate = new Date(`${form.date}T${form.endTime}:00`);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        throw new Error("Choose a valid booking time range.");
      }

      const payload = {
        purpose: form.purpose,
        room: form.room,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      };

      const response = await fetch(
        booking ? `/api/bookings/${booking.id}` : "/api/bookings",
        {
          method: booking ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || result?.details || "Unable to save booking.");
      }

      onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save booking.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalKey = `${open ? "open" : "closed"}-${booking?.id ?? "new-booking"}-${defaultRoomName ?? "default-room"}-${rooms.map((room) => room.id).join("-")}`;

  return (
    <div key={modalKey} className="ui-modal-backdrop">
      <div className="w-full max-w-2xl ui-modal">
        <div className="ui-modal-head mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#008236]">Booking</p>
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight text-black">{booking ? "Edit booking" : "Create booking"}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-black text-black transition hover:bg-black hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
              <MapPin className="h-3.5 w-3.5" />
              Purpose
            </span>
            <input
              value={form.purpose}
              onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
              className="ui-input"
              placeholder="Study session, lab booking, seminar..."
              required
            />
          </label>

          {roomOptions.length === 0 ? (
            <p className="rounded border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-gray-800">No rooms are published by the campus yet. Please check back soon.</p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
                <MapPin className="h-3.5 w-3.5" />
                Room
              </span>
              <select
                value={form.room}
                onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))}
                className="ui-input"
              >
                {roomOptions.map((room) => (
                  <option key={room.id} value={room.name}>
                    {room.name} ({room.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded border-2 border-black bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Selected room</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900">{selectedRoom?.name || form.room}</h3>
              </div>
              <RoomStatusBadge status={selectedRoom?.isAvailable === false ? 'busy' : 'available'} compact />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
              <span className="rounded-sm bg-black px-2 py-1 text-white">{selectedRoom?.code || "N/A"}</span>
              <span className="rounded-sm bg-black px-2 py-1 text-white">{selectedRoom?.floor || "Ground Floor"}</span>
              <span className="rounded-sm bg-black px-2 py-1 text-white">{selectedRoom?.capacity || 0} seats</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
                <CalendarDays className="h-3.5 w-3.5" />
                Date
              </span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                className="ui-input"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
                <Clock3 className="h-3.5 w-3.5" />
                Start
              </span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                className="ui-input"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-gray-800">
                <Clock3 className="h-3.5 w-3.5" />
                End
              </span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                className="ui-input"
                required
              />
            </label>
          </div>

          <RoomAvailabilityStatus
            roomName={form.room}
            date={form.date}
            startTime={form.startTime}
            endTime={form.endTime}
          />

          {error ? (
            <div className="rounded border-2 border-[#008236] bg-white px-3 py-2 text-sm font-semibold text-[#016630]">
              {error}
            </div>
          ) : null}

          <div className="ui-modal-actions">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || roomOptions.length === 0} className="ui-btn ui-btn-primary">
              {isSubmitting ? (booking ? "Saving..." : "Creating...") : booking ? "Save changes" : "Create booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
