import { rangesOverlap } from "./timetable.ts";

const CAMPUS_TIME_ZONE = "Africa/Lusaka";
const CAMPUS_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const CAMPUS_SLOT_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type CampusTimeSlot = {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

export type TimetableBooking = {
  id: string;
  roomId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
};

export type TimetableSlot = {
  roomId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  studentIds?: string[];
};

function campusDate(date: Date) {
  return CAMPUS_DATE_FORMAT.format(date);
}

function campusSlotParts(date: Date) {
  return Object.fromEntries(CAMPUS_SLOT_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]));
}

export function getCampusTimeSlot(startTime: Date, endTime: Date): CampusTimeSlot | null {
  if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) ||
      startTime >= endTime || campusDate(startTime) !== campusDate(endTime) ||
      startTime.getUTCSeconds() !== 0 || startTime.getUTCMilliseconds() !== 0 ||
      endTime.getUTCSeconds() !== 0 || endTime.getUTCMilliseconds() !== 0) {
    return null;
  }

  const start = campusSlotParts(startTime);
  const end = campusSlotParts(endTime);
  if (!start.weekday || !start.hour || !start.minute || !end.hour || !end.minute) return null;

  return {
    dayOfWeek: start.weekday,
    startTime: `${start.hour}:${start.minute}`,
    endTime: `${end.hour}:${end.minute}`,
  };
}

export function bookingConflictsWithTimetable(
  slot: CampusTimeSlot,
  roomId: string,
  allocations: TimetableSlot[],
  studentId?: string
) {
  return allocations.some((allocation) =>
    allocation.dayOfWeek === slot.dayOfWeek &&
    rangesOverlap(slot.startTime, slot.endTime, allocation.startTime, allocation.endTime) &&
    (allocation.roomId === roomId || Boolean(studentId && allocation.studentIds?.includes(studentId)))
  );
}

export function findTimetableConflictingBookings(bookings: TimetableBooking[], allocations: TimetableSlot[]) {
  return bookings.filter((booking) => {
    const slot = getCampusTimeSlot(booking.startTime, booking.endTime);
    return slot && allocations.some((allocation) =>
      allocation.dayOfWeek === slot.dayOfWeek &&
      rangesOverlap(slot.startTime, slot.endTime, allocation.startTime, allocation.endTime) &&
      (allocation.roomId === booking.roomId || Boolean(allocation.studentIds?.includes(booking.userId)))
    );
  });
}

export function timetableConflictsWithBookings(bookings: TimetableBooking[], allocations: TimetableSlot[]) {
  return findTimetableConflictingBookings(bookings, allocations).length > 0;
}
