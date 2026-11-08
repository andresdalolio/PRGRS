import { afterEach, expect, it } from 'vitest';
import {
  LocalDatabase,
  deleteExerciseResult,
  editSession,
  mergeRemote,
  resolveConflict,
  clearAccount,
  deleteDayHistory,
  discardAccount,
} from '../src/lib/db';
import {
  exerciseHistory,
  exerciseRecords,
  completion,
  adherence,
  hasSessionHistory,
  visibleSessions,
} from '../src/lib/domain';
import { saveFeedback, syncFeedback, resolveFeedback, type Feedback } from '../src/lib/feedback';
import { synchronized } from '../src/lib/sync';
import { fixture } from './fixtures/session';
const databases: LocalDatabase[] = [];
function local() {
  const d = new LocalDatabase(crypto.randomUUID());
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases.splice(0)) {
    d.close();
    await d.delete();
  }
});
it('only meaningful eligible results enter stable-ID history; views and whitespace never do', () => {
  const current = fixture(),
    old = fixture(3, 0, '2026-11-01');
  old.blocks[0].entries[0].name = 'Renamed';
  old.blocks[0].entries[0].load = '  ';
  expect(exerciseHistory([old], current, current.blocks[0].entries[0])).toEqual([]);
  old.blocks[0].entries[0].completed = true;
  expect(exerciseHistory([old], current, current.blocks[0].entries[0])).toHaveLength(1);
  old.blocks[0].entries[0].eligible = false;
  expect(exerciseHistory([old], current, current.blocks[0].entries[0])).toEqual([]);
  old.blocks[0].entries[0].eligible = true;
  old.blocks[0].entries[0].exerciseId = 'different';
  expect(exerciseHistory([old], current, current.blocks[0].entries[0])).toEqual([]);
});
it('deletion is atomic, durable, owned, conflict-safe, updates metrics and retains finalization', async () => {
  const d = local(),
    old = fixture(10, 9, '2026-11-01'),
    current = fixture();
  old.status = 'finished';
  old.finishedAt = '2026-11-01T18:00:00Z';
  old.blocks[0].entries[0].load = '24 kg';
  await d.sessions.add(old);
  await expect(deleteExerciseResult(d, 'other', old.id, 'entry-0', 0)).rejects.toThrow('account');
  const next = await deleteExerciseResult(d, 'athlete', old.id, 'entry-0', 0);
  expect(exerciseRecords([old], 'athlete', old.blocks[0].entries[0].exerciseId)).toHaveLength(1);
  expect(exerciseRecords([next], 'athlete', next.blocks[0].entries[0].exerciseId)).toHaveLength(0);
  expect(completion([next]).percent).toBe(80);
  expect(adherence([next], current.date).finished).toBe(1);
  expect(next.finishedAt).toBe(old.finishedAt);
  expect(next.blocks[0].entries[0].prescription).toEqual({ reps: '10' });
  expect(exerciseHistory([next], current, current.blocks[0].entries[0])).toEqual([]);
  await mergeRemote(d, 'athlete', [old]);
  d.close();
  await d.open();
  expect((await d.sessions.get(old.id))?.blocks[0].entries[0].load).toBe('');
  await expect(deleteExerciseResult(d, 'athlete', old.id, 'entry-0', 0)).rejects.toThrow('changed');
  await synchronized(d, 'athlete', async (m) => {
    expect(m.log.results[0]).toMatchObject({ completed: false, load: '', notes: '' });
  });
  await mergeRemote(d, 'athlete', [next]);
  expect(await d.outbox.count()).toBe(0);
  expect((await d.sessions.get(old.id))?.blocks[0].entries[0].completed).toBe(false);
});
it('feedback CRUD survives offline relaunch, retries, conflicts and logout protections', async () => {
  const d = local();
  await d.identities.put({
    id: 'athlete',
    name: 'A',
    email: 'a',
    timezone: 'UTC',
    roles: ['athlete'],
  });
  const created = await saveFeedback(d, 'athlete', null, { title: 'My idea' });
  await saveFeedback(d, 'athlete', created.id, { description: 'Details', implemented: true });
  await saveFeedback(d, 'athlete', created.id, { implemented: false });
  d.close();
  await d.open();
  expect((await d.feedback.get(created.id))?.description).toBe('Details');
  await expect(clearAccount(d, true)).rejects.toThrow('Unsynced');
  await expect(discardAccount(d, 'athlete', [])).rejects.toThrow('changed');
  let remote: Feedback[] = [];
  let fail = true;
  let sent = 0;
  const send = async (m: import('../src/lib/feedback').FeedbackMutation) => {
    sent++;
    if (fail) throw new Error('offline');
    remote = [m.value];
  };
  await syncFeedback(d, 'athlete', send, async () => remote);
  expect(await d.feedbackOutbox.count()).toBe(3);
  fail = false;
  await syncFeedback(d, 'athlete', send, async () => remote);
  expect(sent).toBe(4);
  expect(await d.feedbackOutbox.count()).toBe(0);
  await saveFeedback(d, 'athlete', created.id, { deleted: true });
  await syncFeedback(d, 'athlete', send, async () => remote);
  expect((await d.feedback.get(created.id))?.deleted).toBe(true);
  await expect(saveFeedback(d, 'other', created.id, { title: 'Steal' })).rejects.toThrow(
    'unavailable',
  );
  await clearAccount(d, true);
  expect(await d.feedback.count()).toBe(0);
});
it('feedback resolution requires the reviewed local version and retains queued edits on conflict', async () => {
  const d = local();
  const item = await saveFeedback(d, 'athlete', null, { title: 'Initial' });
  await saveFeedback(d, 'athlete', item.id, { title: 'New edit' });
  await expect(resolveFeedback(d, 'athlete', item, undefined, 'remote')).rejects.toThrow('changed');
  expect(await d.feedbackOutbox.count()).toBe(2);
  const current = (await d.feedback.get(item.id))!;
  await resolveFeedback(d, 'athlete', current, { ...item, title: 'Server', version: 4 }, 'local');
  expect((await d.feedback.get(item.id))?.title).toBe('New edit');
  expect((await d.feedbackOutbox.toArray())[0].baseVersion).toBe(4);
  await expect(
    resolveFeedback(
      d,
      'athlete',
      (await d.feedback.get(item.id))!,
      { ...item, deleted: true },
      'local',
    ),
  ).rejects.toThrow('deleted');
});
it('viewing persisted sessions queues no writes', async () => {
  const d = local(),
    s = fixture();
  await d.sessions.add(s);
  const current = await d.sessions.get(s.id);
  exerciseHistory([s], current!, s.blocks[0].entries[0]);
  await editSession(d, 'athlete', s.id, () => {});
  expect(await d.outbox.count()).toBe(0);
});

it('deletes every session on a date atomically, retains other athletes and other days, and syncs after reload', async () => {
  const d = local(),
    a = fixture(2, 2),
    b = fixture(2, 1),
    other = fixture(2, 2),
    different = fixture(2, 2, '2026-11-05');
  other.athleteId = 'other';
  a.status = 'finished';
  a.finishedAt = '2026-11-06T18:00:00Z';
  b.status = 'in_progress';
  b.blocks[0].entries[0].notes = 'Offline note';
  await d.sessions.bulkAdd([a, b, other, different]);
  const reviewed = [a, b].map((s) => ({ id: s.id, version: s.version }));
  await deleteDayHistory(d, 'athlete', a.date, reviewed);
  d.close();
  await d.open();
  for (const s of [a, b]) {
    const cleared = (await d.sessions.get(s.id))!;
    expect(hasSessionHistory(cleared)).toBe(false);
    expect(cleared.finishedAt).toBeNull();
    expect(completion([cleared]).completed).toBe(0);
    expect(cleared.deleted).toBe(true);
    expect(cleared.blocks).toEqual([]);
    expect(adherence([cleared], cleared.date).due).toBe(0);
  }
  expect((await d.sessions.get(other.id))?.blocks[0].entries[0].completed).toBe(true);
  expect((await d.sessions.get(different.id))?.blocks[0].entries[0].completed).toBe(true);
  expect(await d.outbox.count()).toBe(2);
  await mergeRemote(d, 'athlete', [a, b, other, different]);
  expect(hasSessionHistory((await d.sessions.get(a.id))!)).toBe(false);
  await synchronized(d, 'athlete', async (m) => {
    expect(m.log.deleted).toBe(true);
    expect(m.log.status).toBe('scheduled');
    expect(m.log.finishedAt).toBeNull();
    expect(m.log.results.every((r) => !r.completed && !r.load && !r.notes)).toBe(true);
  });
  expect(await d.outbox.count()).toBe(0);
});
it('day deletion rejects stale reviews, changed membership, and other-account targets without losing edits', async () => {
  const d = local(),
    a = fixture(2, 2),
    b = fixture(2, 1);
  await d.sessions.bulkAdd([a, b]);
  const reviewed = [a, b].map((s) => ({ id: s.id, version: s.version }));
  await expect(deleteDayHistory(d, 'other', a.date, reviewed)).rejects.toThrow('changed');
  await editSession(d, 'athlete', b.id, (s) => {
    s.blocks[0].entries[0].notes = 'New work';
  });
  await expect(deleteDayHistory(d, 'athlete', a.date, reviewed)).rejects.toThrow('changed');
  expect((await d.sessions.get(a.id))?.blocks[0].entries[0].completed).toBe(true);
  expect((await d.sessions.get(b.id))?.blocks[0].entries[0].notes).toBe('New work');
  expect(await d.outbox.count()).toBe(1);
  const latest = await d.sessions.toArray();
  await d.sessions.add(fixture(2, 1));
  await expect(
    deleteDayHistory(
      d,
      'athlete',
      a.date,
      latest.map((s) => ({ id: s.id, version: s.version })),
    ),
  ).rejects.toThrow('changed');
});
it('day deletion rolls back all local changes if any outbox write fails', async () => {
  const d = local(),
    a = fixture(2, 2),
    b = fixture(2, 1);
  await d.sessions.bulkAdd([a, b]);
  let writes = 0;
  d.outbox.hook('creating', () => {
    if (++writes === 2) throw new Error('Storage failure');
  });
  await expect(
    deleteDayHistory(
      d,
      'athlete',
      a.date,
      [a, b].map((s) => ({ id: s.id, version: s.version })),
    ),
  ).rejects.toThrow('Storage failure');
  expect(await d.outbox.count()).toBe(0);
  expect((await d.sessions.get(a.id))?.version).toBe(0);
  expect((await d.sessions.get(b.id))?.version).toBe(0);
});

it('calendar and history share unique session IDs, with deletion excluded from all metrics and exercise records', () => {
  const s = fixture(2, 2);
  s.status = 'finished';
  s.finishedAt = '2026-11-06T18:00:00Z';
  const detached = { ...s, assignmentId: null, version: 1 };
  expect(visibleSessions([s, detached, s])).toEqual([detached]);
  expect(completion([s, detached]).total).toBe(2);
  expect(adherence([s, detached], s.date).due).toBe(1);
  expect(
    exerciseRecords([s, detached], s.athleteId, s.blocks[0].entries[0].exerciseId),
  ).toHaveLength(1);
  const deleted = { ...detached, deleted: true, version: 2 };
  expect(visibleSessions([deleted, s, detached])).toEqual([]);
  expect(completion([deleted]).total).toBe(0);
  expect(adherence([deleted], s.date).due).toBe(0);
  expect(exerciseRecords([deleted], s.athleteId, s.blocks[0].entries[0].exerciseId)).toEqual([]);
});
it('deleted sessions block new edits and cannot be resurrected by conflict rebasing; unacknowledged edits remain exportable', async () => {
  const d = local(),
    s = fixture(2, 2);
  await d.sessions.add(s);
  await editSession(d, 'athlete', s.id, (w) => {
    w.blocks[0].entries[0].notes = 'Unsynced work';
  });
  const remote = { ...s, deleted: true, blocks: [], version: 1 };
  await expect(resolveConflict(d, 'athlete', remote, 'local', 1)).rejects.toThrow('deleted');
  expect(await d.outbox.count()).toBe(1);
  expect((await d.sessions.get(s.id))?.blocks[0].entries[0].notes).toBe('Unsynced work');
  await resolveConflict(d, 'athlete', remote, 'remote', 1);
  expect(visibleSessions(await d.sessions.toArray())).toEqual([]);
  await expect(editSession(d, 'athlete', s.id, () => {})).rejects.toThrow('unavailable');
  await mergeRemote(d, 'athlete', [s]);
  expect(visibleSessions(await d.sessions.toArray())).toEqual([]);
});

it('a concurrent edit requires explicit review before a local deletion can replace it', async () => {
  const d = local(),
    s = fixture(2, 2);
  await d.sessions.add(s);
  await deleteDayHistory(d, 'athlete', s.date, [{ id: s.id, version: 0 }]);
  const remote = structuredClone(s);
  remote.version = 1;
  remote.blocks[0].entries[0].notes = 'Another device';
  await resolveConflict(d, 'athlete', remote, 'local', 1);
  const rebased = (await d.outbox.toArray())[0];
  expect(rebased.baseVersion).toBe(1);
  expect(rebased.log.deleted).toBe(true);
  expect(visibleSessions(await d.sessions.toArray())).toEqual([]);
  await resolveConflict(d, 'athlete', remote, 'remote', 2);
  expect(visibleSessions(await d.sessions.toArray())[0].blocks[0].entries[0].notes).toBe(
    'Another device',
  );
});

it('history deletion preserves unstarted programming on the same date and cannot target it directly', async () => {
  const d = local(),
    recorded = fixture(2, 1),
    scheduled = fixture(2, 0);
  await d.sessions.bulkAdd([recorded, scheduled]);
  await expect(
    deleteDayHistory(d, 'athlete', scheduled.date, [{ id: scheduled.id, version: 0 }]),
  ).rejects.toThrow('changed');
  await deleteDayHistory(d, 'athlete', recorded.date, [{ id: recorded.id, version: 0 }]);
  expect((await d.sessions.get(recorded.id))?.deleted).toBe(true);
  expect(await d.sessions.get(scheduled.id)).toEqual(scheduled);
  expect(await d.outbox.count()).toBe(1);
  expect(visibleSessions(await d.sessions.toArray())).toEqual([scheduled]);
});
