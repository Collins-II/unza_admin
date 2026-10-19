import mongoose, { type ClientSession } from "mongoose";
import AuditEvent from "@/lib/database/models/AuditEvent";

export async function recordAudit(session: ClientSession, actor: string, action: string, target: string, details: Record<string, string> = {}) {
  await AuditEvent.create([{ actor, action, target, details }], { session });
}

export async function auditedMutation<T>(
  actor: string, action: string, target: string, details: Record<string, string>,
  mutate: (session: ClientSession) => Promise<T>
) {
  await AuditEvent.init();
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const result = await mutate(session);
      await recordAudit(session, actor, action, target, details);
      return result;
    });
  } finally {
    await session.endSession();
  }
}
