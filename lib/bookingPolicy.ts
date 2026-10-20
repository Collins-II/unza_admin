export const BOOKING_PURPOSES = ["Tutorial Group", "Event"] as const;
export type BookingPurpose = (typeof BOOKING_PURPOSES)[number];
export type TutorialGroupDetails = {
  groupName: string;
  courseCode: string;
  topic: string;
  leaderName: string;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isBookingPurpose(value: unknown): value is BookingPurpose {
  return value === "Tutorial Group" || value === "Event";
}

export function isBookableLectureRoom(room: { spaceType?: string; category?: string }) {
  return room.spaceType === "lecture_room";
}

export function validateBookingSchedule(purpose: BookingPurpose, start: Date, end: Date, submittedAt: Date) {
  if (![start, end, submittedAt].every((date) => date instanceof Date && Number.isFinite(date.getTime())) || end <= start) {
    return "Choose a valid start, end, and submission time.";
  }
  const notice = start.getTime() - submittedAt.getTime();
  if (purpose === "Tutorial Group" && notice < 2 * DAY_MS) {
    return "Tutorial Groups must be requested at least 48 hours before the start time.";
  }
  if (purpose === "Event" && (notice < 7 * DAY_MS || notice > 14 * DAY_MS)) {
    return "Events must be requested between 7 and 14 days before the start time.";
  }
  return null;
}

export function parseTutorialGroup(value: unknown): TutorialGroupDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Record<string, unknown>;
  const limits = { groupName: 120, courseCode: 30, topic: 1000, leaderName: 120 };
  if (Object.keys(details).some((key) => !(key in limits))) return null;
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof details[key] !== "string" || !details[key].trim() || details[key].trim().length > limit) return null;
  }
  return {
    groupName: String(details.groupName).trim(),
    courseCode: String(details.courseCode).trim().toUpperCase(),
    topic: String(details.topic).trim(),
    leaderName: String(details.leaderName).trim(),
  };
}

export function validateBookingDetails(value: {
  purpose?: unknown; title?: unknown; attendees?: unknown; tutorialGroup?: unknown;
}) {
  if (!isBookingPurpose(value.purpose)) return "Choose Tutorial Group or Event as the booking purpose.";
  if (typeof value.attendees !== "number" || !Number.isSafeInteger(value.attendees) || value.attendees < 1) {
    return "Enter a positive whole number of expected attendees.";
  }
  if (value.title !== undefined && (typeof value.title !== "string" || value.title.trim().length > 120)) {
    return "The booking title must be at most 120 characters.";
  }
  if (value.purpose === "Tutorial Group" && !parseTutorialGroup(value.tutorialGroup)) {
    return "Tutorial Groups require a group name, course code, topic, and tutor or group-leader name.";
  }
  if (value.purpose === "Event" && (typeof value.title !== "string" || !value.title.trim())) {
    return "Provide the event name as the booking title.";
  }
  return null;
}
