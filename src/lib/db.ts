import Dexie, { type EntityTable } from 'dexie';
import { type WorkoutSession, type SessionLog, sessionLog } from './domain';
export type Mutation = {
  id: string;
  ownerId: string;
  sessionId: string;
  baseVersion: number;
  log: SessionLog;
  createdAt: string;
  attempts: number;
  error?: string;
  conflict?: boolean;
};
export type Identity = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  roles: ('athlete' | 'coach')[];
};
export class LocalDatabase extends Dexie {
  sessions!: EntityTable<WorkoutSession, 'id'>;
  outbox!: EntityTable<Mutation, 'id'>;
  identities!: EntityTable<Identity, 'id'>;
  constructor(name = 'prgrs-v1') {
    super(name);
    this.version(1).stores({
      sessions: 'id,athleteId,date',
      outbox: 'id,ownerId,sessionId,createdAt',
      identities: 'id',
    });
  }
}
let local: LocalDatabase | undefined;
export function db() {
  return (local ??= new LocalDatabase());
}
export async function editSession(
  database: LocalDatabase,
  ownerId: string,
  id: string,
  change: (s: WorkoutSession) => void,
) {
  return database.transaction('rw', database.sessions, database.outbox, async () => {
    const original = await database.sessions.get(id);
    if (!original || original.athleteId !== ownerId)
      throw new Error('Workout unavailable for this account.');
    const next = structuredClone(original);
    change(next);
    const log = sessionLog(next);
    if (JSON.stringify(log) === JSON.stringify(sessionLog(original))) return original;
    next.version = original.version + 1;
    next.updatedAt = new Date().toISOString();
    const mutation: Mutation = {
      id: crypto.randomUUID(),
      ownerId,
      sessionId: id,
      baseVersion: original.version,
      log,
      createdAt: next.updatedAt,
      attempts: 0,
    };
    await database.sessions.put(next);
    await database.outbox.add(mutation);
    return next;
  });
}
export async function mergeRemote(
  database: LocalDatabase,
  ownerId: string,
  sessions: WorkoutSession[],
  requireIdentity = false,
) {
  await database.transaction(
    'rw',
    database.sessions,
    database.outbox,
    database.identities,
    async () => {
      if (requireIdentity && !(await database.identities.get(ownerId))) return;
      const pending = new Set(
        (await database.outbox.where('ownerId').equals(ownerId).toArray()).map((m) => m.sessionId),
      );
      const accessible = new Set(sessions.map((s) => s.id));
      for (const cached of await database.sessions.toArray()) {
        if (!accessible.has(cached.id) && !pending.has(cached.id))
          await database.sessions.delete(cached.id);
      }
      for (const session of sessions) {
        const cached = await database.sessions.get(session.id);
        if (!pending.has(session.id) && (!cached || session.version >= cached.version))
          await database.sessions.put(session);
      }
    },
  );
}
export async function resolveConflict(
  database: LocalDatabase,
  ownerId: string,
  remote: WorkoutSession,
  choice: 'local' | 'remote',
  reviewedVersion: number,
) {
  await database.transaction('rw', database.sessions, database.outbox, async () => {
    const pending = await database.outbox.where('sessionId').equals(remote.id).toArray();
    if (pending.some((m) => m.ownerId !== ownerId) || remote.athleteId !== ownerId)
      throw new Error('Account mismatch');
    const local = await database.sessions.get(remote.id);
    if (!local || local.version !== reviewedVersion)
      throw new Error('This workout changed since review. Close and review both versions again.');
    await database.outbox.bulkDelete(pending.map((m) => m.id));
    if (choice === 'remote') {
      await database.sessions.put(remote);
      return;
    }
    await database.sessions.put({ ...local, version: remote.version + 1 });
    await database.outbox.add({
      id: crypto.randomUUID(),
      ownerId,
      sessionId: remote.id,
      baseVersion: remote.version,
      log: sessionLog(local),
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  });
}
export async function discardAccount(
  database: LocalDatabase,
  ownerId: string,
  reviewedMutationIds: string[],
) {
  await database.transaction(
    'rw',
    database.sessions,
    database.outbox,
    database.identities,
    async () => {
      const pending = await database.outbox.toArray();
      const identities = await database.identities.toArray();
      const reviewed = new Set(reviewedMutationIds);
      if (
        identities.some((i) => i.id !== ownerId) ||
        pending.some((m) => m.ownerId !== ownerId || !reviewed.has(m.id))
      )
        throw new Error(
          'Local work changed. Review and export pending edits before discarding again.',
        );
      await database.sessions.clear();
      await database.outbox.clear();
      await database.identities.clear();
    },
  );
}
export async function clearAccount(database: LocalDatabase, requireSynced = false) {
  await database.transaction(
    'rw',
    database.sessions,
    database.outbox,
    database.identities,
    async () => {
      if (requireSynced && (await database.outbox.count()))
        throw new Error(
          'Unsynced work is preserved. Sign in with the same account and synchronize before signing out.',
        );
      await database.sessions.clear();
      await database.outbox.clear();
      await database.identities.clear();
    },
  );
}
