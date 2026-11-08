import { type LocalDatabase } from './db';
import { supabase, unwrap } from './supabase';
import { z } from 'zod';
import { reportError } from './observability';
export type Feedback = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  implemented: boolean;
  createdAt: string;
  version: number;
  deleted: boolean;
};
export type FeedbackMutation = {
  id: string;
  ownerId: string;
  itemId: string;
  baseVersion: number;
  value: Feedback;
  sequence?: number;
  error?: string;
};
export async function saveFeedback(
  database: LocalDatabase,
  ownerId: string,
  id: string | null,
  patch: Partial<Pick<Feedback, 'title' | 'description' | 'implemented' | 'deleted'>>,
) {
  return database.transaction('rw', database.feedback, database.feedbackOutbox, async () => {
    const previous = id ? await database.feedback.get(id) : undefined;
    if (id && (!previous || previous.ownerId !== ownerId || previous.deleted))
      throw new Error('Feedback unavailable');
    const next: Feedback = {
      id: crypto.randomUUID(),
      ownerId,
      title: '',
      description: '',
      implemented: false,
      createdAt: new Date().toISOString(),
      version: 0,
      deleted: false,
      ...previous,
      ...patch,
    };
    next.title = next.title.trim();
    if (!next.title || next.title.length > 160 || next.description.length > 4000)
      throw new Error('Enter a title up to 160 characters and description up to 4000 characters.');
    const baseVersion = next.version++;
    await database.feedback.put(next);
    await database.feedbackOutbox.add({
      id: crypto.randomUUID(),
      ownerId,
      itemId: next.id,
      baseVersion,
      value: next,
    });
    return next;
  });
}
const remoteSchema = z.array(
  z.object({
    id: z.string().uuid(),
    owner_id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    implemented: z.boolean(),
    created_at: z.string(),
    version: z.number().int(),
    deleted: z.boolean(),
  }),
);
export async function fetchFeedback(): Promise<Feedback[]> {
  const rows = remoteSchema.parse(unwrap(await supabase().from('feedback_items').select('*')));
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    description: r.description,
    implemented: r.implemented,
    createdAt: r.created_at,
    version: r.version,
    deleted: r.deleted,
  }));
}
export async function sendFeedback(m: FeedbackMutation) {
  const version = unwrap(
    await supabase().rpc('apply_feedback_mutation', {
      p_id: m.id,
      p_item: m.itemId,
      p_base_version: m.baseVersion,
      p_value: m.value,
    }),
  );
  if (version !== m.baseVersion + 1)
    throw new Error('Invalid feedback acknowledgement. Local edits are preserved.');
}
const locks = new Map<string, Promise<void>>();
export function syncFeedback(
  database: LocalDatabase,
  ownerId: string,
  send = sendFeedback,
  fetch = fetchFeedback,
) {
  const key = database.name + ownerId;
  const prior = locks.get(key);
  if (prior) return prior;
  const run = (async () => {
    const pending = (await database.feedbackOutbox.where('ownerId').equals(ownerId).toArray()).sort(
      (a, b) => a.itemId.localeCompare(b.itemId) || a.baseVersion - b.baseVersion,
    );
    const blocked = new Set<string>();
    for (const m of pending) {
      if (blocked.has(m.itemId)) continue;
      try {
        await send(m);
        await database.feedbackOutbox.delete(m.sequence!);
      } catch (error) {
        reportError('sync', error);
        await database.feedbackOutbox.update(m.sequence!, {
          error: error instanceof Error ? error.message : 'Feedback sync failed',
        });
        blocked.add(m.itemId);
      }
    }
    const remote = await fetch();
    await database.transaction(
      'rw',
      database.feedback,
      database.feedbackOutbox,
      database.identities,
      async () => {
        if (!(await database.identities.get(ownerId))) return;
        const pendingIds = new Set(
          (await database.feedbackOutbox.where('ownerId').equals(ownerId).toArray()).map(
            (m) => m.itemId,
          ),
        );
        for (const item of remote) {
          const cached = await database.feedback.get(item.id);
          if (
            item.ownerId === ownerId &&
            !pendingIds.has(item.id) &&
            (!cached || item.version >= cached.version)
          )
            await database.feedback.put(item);
        }
      },
    );
  })().finally(() => locks.delete(key));
  locks.set(key, run);
  return run;
}
export async function resolveFeedback(
  database: LocalDatabase,
  ownerId: string,
  local: Feedback,
  remote: Feedback | undefined,
  choice: 'local' | 'remote',
) {
  await database.transaction('rw', database.feedback, database.feedbackOutbox, async () => {
    const current = await database.feedback.get(local.id);
    if (
      !current ||
      current.ownerId !== ownerId ||
      current.version !== local.version ||
      (remote && remote.ownerId !== ownerId)
    )
      throw new Error('Feedback changed. Review both versions again.');
    if (choice === 'local' && remote?.deleted)
      throw new Error(
        'This idea was deleted on another device. Copy its text into a new idea to keep it.',
      );
    await database.feedbackOutbox.where('itemId').equals(local.id).delete();
    if (choice === 'remote') {
      if (remote) await database.feedback.put(remote);
      else await database.feedback.delete(local.id);
    } else {
      const baseVersion = remote?.version ?? 0;
      const next = { ...local, version: baseVersion + 1 };
      await database.feedback.put(next);
      await database.feedbackOutbox.add({
        id: crypto.randomUUID(),
        ownerId,
        itemId: local.id,
        baseVersion,
        value: next,
      });
    }
  });
}
