import { afterEach, expect, it, vi } from 'vitest';
import { sendMutation, fetchSessions } from '../src/lib/remote';
import { LocalDatabase, editSession } from '../src/lib/db';
import { synchronized } from '../src/lib/sync';
import { fixture } from './fixtures/session';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({
  supabase: () => ({ rpc }),
  unwrap: (result: { data: unknown; error: Error | null }) => {
    if (result.error) throw result.error;
    return result.data;
  },
}));
afterEach(() => vi.resetAllMocks());

it('retains the durable mutation after a malformed acknowledgement and retries the same ID', async () => {
  const database = new LocalDatabase(crypto.randomUUID());
  try {
    const session = fixture();
    await database.sessions.add(session);
    await editSession(database, 'athlete', session.id, (s) => {
      s.blocks[0].entries[0].load = '24 kg';
    });
    const mutation = (await database.outbox.toArray())[0];
    rpc.mockResolvedValue({ data: null, error: null });
    await synchronized(database, 'athlete', sendMutation);
    expect((await database.outbox.get(mutation.id))?.error).toContain('acknowledgement');
    expect((await database.sessions.get(session.id))?.blocks[0].entries[0].load).toBe('24 kg');
    rpc.mockResolvedValue({ data: 1, error: null });
    await synchronized(database, 'athlete', sendMutation);
    expect(await database.outbox.count()).toBe(0);
    expect(rpc.mock.calls.map((call) => call[1].p_id)).toEqual([mutation.id, mutation.id]);
  } finally {
    await database.delete();
  }
});

it('rejects malformed snapshots before they can enter reconciliation', async () => {
  rpc.mockResolvedValue({ data: [{ id: 'invalid' }], error: null });
  await expect(fetchSessions()).rejects.toThrow();
});
