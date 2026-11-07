import { type LocalDatabase, type Mutation } from './db';
import { reportError } from './observability';
export type SyncTransport = (mutation: Mutation) => Promise<void>;
export async function flushOutbox(database: LocalDatabase, ownerId: string, send: SyncTransport) {
  const pending = (await database.outbox.where('ownerId').equals(ownerId).sortBy('createdAt')).sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.baseVersion - b.baseVersion,
  );
  const blocked = new Set<string>();
  for (const item of pending) {
    if (blocked.has(item.sessionId) || item.conflict) {
      blocked.add(item.sessionId);
      continue;
    }
    try {
      await send(item);
      await database.outbox.delete(item.id);
    } catch (error) {
      reportError('sync', error);
      const message = error instanceof Error ? error.message : 'Synchronization failed';
      await database.outbox.update(item.id, {
        attempts: item.attempts + 1,
        error: message,
        conflict: message.includes('VERSION_CONFLICT'),
      });
      blocked.add(item.sessionId);
    }
  }
}
const locks = new Map<string, Promise<void>>();
export function synchronized(database: LocalDatabase, ownerId: string, send: SyncTransport) {
  const key = database.name + ownerId;
  const prior = locks.get(key);
  if (prior) return prior;
  const run = flushOutbox(database, ownerId, send).finally(() => locks.delete(key));
  locks.set(key, run);
  return run;
}
