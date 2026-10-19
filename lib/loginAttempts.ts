import { LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from "./studentRegistration.ts";

export function failedLoginUpdate(now = new Date()) {
  const attempts = { $add: [{ $ifNull: ["$failedLoginAttempts", 0] }, 1] };
  const locked = { $gte: [attempts, MAX_FAILED_LOGINS] };
  return [{
    $set: {
      failedLoginAttempts: { $cond: [locked, 0, attempts] },
      lockedUntil: { $cond: [locked, new Date(now.getTime() + LOCKOUT_MINUTES * 60_000), "$lockedUntil"] },
    },
  }];
}
