"use client";

import { useEffect, useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { isBookingPurpose, validateBookingDetails, validateBookingSchedule, type TutorialGroupDetails } from "@/lib/bookingPolicy";

type BookingStatus = "pending" | "confirmed" | "cancelled";
type Booking = {
  _id: string;
  purpose: string;
  title?: string;
  attendees?: number;
  tutorialGroup?: TutorialGroupDetails;
  requestedAt?: string;
  createdAt: string;
  reviewedAt?: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  cancellationReason?: string;
  user?: { name?: string; studentId?: string };
  room?: { name?: string; code?: string; building?: string };
};

const campusDateTime = new Intl.DateTimeFormat("en-ZM", {
  timeZone: "Africa/Lusaka",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatBookingTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid booking time" : campusDateTime.format(date);
}

export function BookingsManagement({
  revision,
  onStatusChange,
}: {
  revision: number;
  onStatusChange: (id: string, status: BookingStatus) => void;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [purposeFilter, setPurposeFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/bookings", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load room bookings.");
        if (controller.signal.aborted) return;
        setBookings(result.bookings);
        setError("");
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load room bookings.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, refreshVersion]);

  const refreshBookings = () => {
    setLoading(true);
    setError("");
    setRefreshVersion((value) => value + 1);
  };
  const pending = bookings.filter((booking) => booking.status === "pending").length;

  return (
    <section className="space-y-4">
      <div className="ui-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="ui-eyebrow">Student room requests</p>
          <h3 className="ui-title mt-1 text-2xl">Room bookings</h3>
          <p className="mt-2 text-sm text-slate-500">
            {pending} pending request{pending === 1 ? "" : "s"} · showing the latest 100 bookings
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={loading} onClick={refreshBookings}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <label className="block max-w-sm">
        <span className="ui-label">Booking purpose</span>
        <select className="ui-input" value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value)}>
          <option value="">All purposes</option><option>Tutorial Group</option><option>Event</option>
        </select>
      </label>
      <p className="text-sm text-slate-500">Tutorial Groups require at least 48 hours&apos; notice. Events require 7–14 days&apos; notice. Eligibility is measured at submission, not when staff review the request. Published classes take priority.</p>

      {error && (
        <div role="alert" className="ui-card border-rose-200 bg-rose-50 text-sm text-rose-800">
          {error}
          <button type="button" className="ml-3 underline" onClick={refreshBookings}>Retry</button>
        </div>
      )}
      {loading ? (
        <div className="ui-card text-sm text-slate-500" role="status">Loading room bookings...</div>
      ) : bookings.length === 0 ? (
        <div className="ui-card text-sm text-slate-500">No student room bookings have been submitted.</div>
      ) : (
        <div className="space-y-3">
          {bookings.filter((booking) => !purposeFilter || booking.purpose === purposeFilter).map((booking) => {
            const policyError = validateBookingDetails(booking) || (isBookingPurpose(booking.purpose)
              ? validateBookingSchedule(booking.purpose, new Date(booking.startTime), new Date(booking.endTime), new Date(booking.requestedAt || booking.createdAt))
              : "The student must resubmit with a supported purpose.");
            return (
            <article key={booking._id} className="ui-card flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-slate-900">{booking.room?.name || "Unknown room"}</h4>
                  <span className="text-xs text-slate-500">{booking.room?.code || "No room code"} · {booking.room?.building || "Building not specified"}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    booking.status === "confirmed"
                      ? "bg-emerald-50 text-emerald-800"
                      : booking.status === "cancelled"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-50 text-amber-800"
                  }`}>{booking.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{booking.purpose}</p>
                <p className="mt-1 text-sm">{booking.title} · {booking.attendees ?? "Unspecified"} attendees</p>
                {booking.tutorialGroup && (
                  <dl className="mt-3 space-y-1 text-sm">
                    <div><dt className="inline font-medium">TG: </dt><dd className="inline">{booking.tutorialGroup.groupName}</dd></div>
                    <div><dt className="inline font-medium">Course: </dt><dd className="inline">{booking.tutorialGroup.courseCode}</dd></div>
                    <div><dt className="inline font-medium">Tutor / leader: </dt><dd className="inline">{booking.tutorialGroup.leaderName}</dd></div>
                    <div><dt className="inline font-medium">Topic: </dt><dd className="inline whitespace-pre-wrap break-words">{booking.tutorialGroup.topic}</dd></div>
                  </dl>
                )}
                <p className="mt-2 text-xs text-slate-500">Submitted: {formatBookingTime(booking.requestedAt || booking.createdAt)}</p>
                {booking.status === "pending" && policyError && <p className="mt-2 text-sm text-rose-700" role="status">{policyError}</p>}
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <CalendarClock size={15} />
                  {formatBookingTime(booking.startTime)} – {formatBookingTime(booking.endTime)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {booking.user?.name || "Unknown student"} · {booking.user?.studentId || "No student ID"}
                </p>
                {booking.status === "cancelled" && booking.cancellationReason === "timetable_conflict" && (
                  <p className="mt-2 text-xs font-medium text-rose-700">Cancelled because a published class takes priority.</p>
                )}
              </div>
              {booking.status !== "cancelled" && (
                <div className="flex shrink-0 gap-2">
                  {booking.status === "pending" && (
                    <button type="button" disabled={Boolean(policyError) || loading || Boolean(error)} className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => onStatusChange(booking._id, "confirmed")}>
                      Confirm
                    </button>
                  )}
                  <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" onClick={() => onStatusChange(booking._id, "cancelled")}>
                    Cancel
                  </button>
                </div>
              )}
            </article>
          ); })}
        </div>
      )}
    </section>
  );
}
