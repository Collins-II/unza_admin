export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function timeToMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isTimeRangeValid(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start !== null && end !== null && start < end;
}

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  return aStart !== null && aEnd !== null && bStart !== null && bEnd !== null && aStart < bEnd && aEnd > bStart;
}
