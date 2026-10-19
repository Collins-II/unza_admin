import { randomUUID } from "node:crypto";

import TimetableLock from "@/lib/database/models/TimetableLock";

const LOCK_LEASE_MS = 15 * 60 * 1000;
const CONFIGURATION_LOCK_YEAR = "__system__";
const CONFIGURATION_LOCK_SEMESTER = "configuration";

export type TimetableMutationLock = {
  configuration: { key: string; token: string };
  term: { key: string; token: string };
};

export async function acquireTimetableLock(academicYear: string, semester: string) {
  const key = `${academicYear.trim()}|${semester.trim()}`;
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_LEASE_MS);
  const reclaimed = await TimetableLock.findOneAndUpdate(
    { key, expiresAt: { $lte: now } },
    { $set: { token, expiresAt } },
    { new: true }
  ).lean();
  if (reclaimed?.token === token) return { key, token };
  try {
    await TimetableLock.create({ key, token, expiresAt });
    return { key, token };
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) return null;
    throw error;
  }
}

export async function releaseTimetableLock(lock: { key: string; token: string }) {
  await TimetableLock.deleteOne({ key: lock.key, token: lock.token });
}

export async function renewTimetableLock(lock: { key: string; token: string }) {
  const now = new Date();
  const result = await TimetableLock.updateOne(
    { key: lock.key, token: lock.token, expiresAt: { $gt: now } },
    { $set: { expiresAt: new Date(now.getTime() + LOCK_LEASE_MS) } }
  );
  if (result.matchedCount !== 1) throw new Error("The timetable update lock expired or was lost. No changes were committed.");
}

export async function acquireTimetableConfigurationLock() {
  return acquireTimetableLock(CONFIGURATION_LOCK_YEAR, CONFIGURATION_LOCK_SEMESTER);
}

export async function acquireTimetableMutationLock(academicYear: string, semester: string): Promise<TimetableMutationLock | null> {
  const configuration = await acquireTimetableConfigurationLock();
  if (!configuration) return null;
  try {
    const term = await acquireTimetableLock(academicYear, semester);
    if (!term) {
      await releaseTimetableLock(configuration);
      return null;
    }
    return { configuration, term };
  } catch (error) {
    await releaseTimetableLock(configuration);
    throw error;
  }
}

export async function releaseTimetableMutationLock(lock: TimetableMutationLock) {
  try {
    await releaseTimetableLock(lock.term);
  } finally {
    await releaseTimetableLock(lock.configuration);
  }
}

export async function renewTimetableMutationLock(lock: TimetableMutationLock) {
  await Promise.all([
    renewTimetableLock(lock.configuration),
    renewTimetableLock(lock.term),
  ]);
}
