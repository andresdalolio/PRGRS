import { afterEach, describe, expect, it } from 'vitest';
import {
  LocalDatabase,
  editSession,
  mergeRemote,
  resolveConflict,
  clearAccount,
  discardAccount,
} from '../src/lib/db';
import { synchronized } from '../src/lib/sync';
import { fixture } from './fixtures/session';
const databases: LocalDatabase[] = [];
function database(name = crypto.randomUUID()) {
  const d = new LocalDatabase(name);
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases.splice(0)) {
    d.close();
    await d.delete();
  }
});
describe('durable workout outbox', () => {
  it('does not repopulate private data after logout during an in-flight fetch', async () => {
    const d = database(),
      s = fixture();
    await mergeRemote(d, 'athlete', [s], true);
    expect(await d.sessions.count()).toBe(0);
  });
  it('refuses to clear a cache if another tab queued unsynced work', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => (s.status = 'in_progress'));
    await expect(clearAccount(d, true)).rejects.toThrow('Unsynced work');
    expect(await d.sessions.count()).toBe(1);
    expect(await d.outbox.count()).toBe(1);
  });

  it('does not queue a second mutation for an unchanged result', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => (s.blocks[0].entries[0].load = '24 kg'));
    await editSession(d, 'athlete', s.id, (s) => (s.blocks[0].entries[0].load = '24 kg'));
    expect(await d.outbox.count()).toBe(1);
    expect((await d.sessions.get(s.id))?.version).toBe(1);
  });
  it('does not regress versions or retain revoked cached access after reconciliation', async () => {
    const d = database(),
      s = fixture(),
      revoked = fixture();
    s.version = 4;
    await d.sessions.bulkAdd([s, revoked]);
    await mergeRemote(d, 'athlete', [{ ...s, version: 3 }]);
    expect((await d.sessions.get(s.id))?.version).toBe(4);
    expect(await d.sessions.get(revoked.id)).toBeUndefined();
  });

  it('check, uncheck, load and partial finish survive reopening IndexedDB', async () => {
    const d = database(),
      s = fixture(10, 9);
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => {
      s.blocks[0].entries[0].completed = false;
    });
    await editSession(d, 'athlete', s.id, (s) => {
      s.blocks[0].entries[0].completed = true;
      s.blocks[0].entries[0].load = '24 kg';
      s.blocks[0].entries[0].notes = 'Good control';
      s.status = 'finished';
      s.finishedAt = '2026-11-06T20:00:00Z';
    });
    d.close();
    await d.open();
    const actual = await d.sessions.get(s.id);
    expect(actual?.status).toBe('finished');
    expect(actual?.blocks[0].entries.filter((e) => e.completed)).toHaveLength(9);
    expect(actual?.blocks[0].entries[0].load).toBe('24 kg');
    expect(await d.outbox.count()).toBe(2);
  });
  it('a local write and its mutation are atomic', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await expect(
      editSession(d, 'wrong-account', s.id, (s) => (s.status = 'finished')),
    ).rejects.toThrow('unavailable');
    expect((await d.sessions.get(s.id))?.version).toBe(0);
    expect(await d.outbox.count()).toBe(0);
  });
  it('rolls back the session edit if the outbox write fails', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    d.outbox.hook('creating', () => {
      throw new Error('Outbox storage failed');
    });
    await expect(
      editSession(d, 'athlete', s.id, (s) => {
        s.blocks[0].entries[0].load = '24 kg';
      }),
    ).rejects.toThrow('Outbox storage failed');
    expect((await d.sessions.get(s.id))?.version).toBe(0);
    expect((await d.sessions.get(s.id))?.blocks[0].entries[0].load).toBe('');
    expect(await d.outbox.count()).toBe(0);
  });
  it('preserves edits and mutation identity across authentication expiry and database reopen', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => {
      s.blocks[0].entries[0].notes = 'Keep through reauthentication';
    });
    const mutation = (await d.outbox.toArray())[0];
    await synchronized(d, 'athlete', async () => {
      throw new Error('JWT expired');
    });
    d.close();
    await d.open();
    await mergeRemote(d, 'athlete', [s]);
    expect((await d.sessions.get(s.id))?.blocks[0].entries[0].notes).toBe(
      'Keep through reauthentication',
    );
    expect((await d.outbox.get(mutation.id))?.error).toBe('JWT expired');
    const ids: string[] = [];
    await synchronized(d, 'athlete', async (m) => {
      ids.push(m.id);
    });
    expect(ids).toEqual([mutation.id]);
    expect(await d.outbox.count()).toBe(0);
  });
  it('retries the same logical ID after an acknowledgement is lost', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => (s.blocks[0].entries[0].completed = true));
    const acknowledged = new Set<string>();
    let serverWrites = 0,
      first = true;
    const transport = async (m: { id: string }) => {
      if (!acknowledged.has(m.id)) {
        acknowledged.add(m.id);
        serverWrites++;
      }
      if (first) {
        first = false;
        throw new Error('Network lost after commit');
      }
    };
    await synchronized(d, 'athlete', transport);
    expect(await d.outbox.count()).toBe(1);
    expect((await d.outbox.toArray())[0].error).toMatch('Network');
    await synchronized(d, 'athlete', transport);
    expect(serverWrites).toBe(1);
    expect(await d.outbox.count()).toBe(0);
  });
  it('preserves ordering and stops only the affected session after failure', async () => {
    const d = database(),
      a = fixture(),
      b = fixture();
    await d.sessions.bulkAdd([a, b]);
    await editSession(d, 'athlete', a.id, (s) => (s.blocks[0].entries[0].completed = true));
    await editSession(d, 'athlete', a.id, (s) => (s.blocks[0].entries[1].completed = true));
    await editSession(d, 'athlete', b.id, (s) => (s.status = 'in_progress'));
    const sent: string[] = [];
    await synchronized(d, 'athlete', async (m) => {
      sent.push(m.sessionId);
      if (m.sessionId === a.id) throw new Error('temporary');
    });
    expect(sent.filter((id) => id === a.id)).toHaveLength(1);
    expect(sent).toContain(b.id);
    expect(await d.outbox.count()).toBe(2);
  });
  it('remote reconciliation cannot overwrite pending edits', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => (s.blocks[0].entries[0].notes = 'Keep me'));
    await mergeRemote(d, 'athlete', [s]);
    expect((await d.sessions.get(s.id))?.blocks[0].entries[0].notes).toBe('Keep me');
  });
  it('conflicts preserve local logs until explicitly rebased', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => (s.blocks[0].entries[0].load = '32 kg'));
    await synchronized(d, 'athlete', async () => {
      throw new Error('VERSION_CONFLICT');
    });
    expect((await d.outbox.toArray())[0].conflict).toBe(true);
    await synchronized(d, 'athlete', async () => {
      throw new Error('Should not retry unresolved conflict');
    });
    expect((await d.outbox.toArray())[0].attempts).toBe(1);
    await resolveConflict(d, 'athlete', { ...s, version: 5 }, 'local', 1);
    const queue = await d.outbox.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0].baseVersion).toBe(5);
    expect(queue[0].log.results[0].load).toBe('32 kg');
    expect((await d.sessions.get(s.id))?.version).toBe(6);
  });
  it('synchronizes one foreground loop at a time', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => (s.status = 'in_progress'));
    let calls = 0;
    const send = async () => {
      calls++;
    };
    await Promise.all([synchronized(d, 'athlete', send), synchronized(d, 'athlete', send)]);
    expect(calls).toBe(1);
  });
  it('explicit discard clears reviewed pending work and private cache', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    await editSession(d, 'athlete', s.id, (s) => {
      s.blocks[0].entries[0].notes = 'Reviewed';
    });
    await discardAccount(
      d,
      'athlete',
      (await d.outbox.toArray()).map((m) => m.id),
    );
    expect(await d.sessions.count()).toBe(0);
    expect(await d.outbox.count()).toBe(0);
  });
  it('discard preserves work queued in another tab after the confirmation was prepared', async () => {
    const d = database(),
      s = fixture();
    await d.sessions.add(s);
    const reviewed: string[] = [];
    await editSession(d, 'athlete', s.id, (s) => {
      s.blocks[0].entries[0].notes = 'New work';
    });
    await expect(discardAccount(d, 'athlete', reviewed)).rejects.toThrow('Local work changed');
    expect(await d.outbox.count()).toBe(1);
    expect((await d.sessions.get(s.id))?.blocks[0].entries[0].notes).toBe('New work');
  });
  for (const choice of ['local', 'remote'] as const) {
    it(`rejects stale ${choice} conflict choices without losing newer edits`, async () => {
      const d = database(),
        s = fixture();
      await d.sessions.add(s);
      await editSession(d, 'athlete', s.id, (s) => {
        s.blocks[0].entries[0].load = '24 kg';
      });
      const reviewed = (await d.sessions.get(s.id))!;
      await editSession(d, 'athlete', s.id, (s) => {
        s.blocks[0].entries[0].load = '32 kg';
      });
      await expect(
        resolveConflict(d, 'athlete', { ...s, version: 5 }, choice, reviewed.version),
      ).rejects.toThrow('changed since review');
      expect(await d.outbox.count()).toBe(2);
      expect((await d.sessions.get(s.id))?.blocks[0].entries[0].load).toBe('32 kg');
    });
  }
});
