import { createTestDatabase } from './test-database.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const db = await createTestDatabase();
const owner = randomUUID(),
  other = randomUUID();
async function asUser(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
async function feedback(m, id, version, value) {
  return (
    await db.query('select public.apply_feedback_mutation($1,$2,$3,$4::jsonb) as v', [
      m,
      id,
      version,
      JSON.stringify(value),
    ])
  ).rows[0].v;
}
try {
  await db.query('insert into auth.users(id) values($1),($2)', [owner, other]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'coach')", [owner]);
  await asUser(owner);
  const id = randomUUID(),
    mutation = randomUUID(),
    value = {
      title: 'Idea',
      description: 'Details',
      implemented: false,
      deleted: false,
      createdAt: new Date().toISOString(),
    };
  assert.equal(await feedback(mutation, id, 0, value), 1);
  assert.equal(await feedback(mutation, id, 0, value), 1);
  await assert.rejects(() => feedback(randomUUID(), id, 0, value), /VERSION_CONFLICT/);
  assert.equal(await feedback(randomUUID(), id, 1, { ...value, implemented: true }), 2);
  assert.equal(
    await feedback(randomUUID(), id, 2, { ...value, implemented: false, title: 'Edited' }),
    3,
  );
  await asUser(other);
  assert.equal((await db.query('select * from public.feedback_items')).rows.length, 0);
  await assert.rejects(() => feedback(randomUUID(), id, 3, value), /unavailable/);
  await assert.rejects(
    () => db.query('delete from public.feedback_items where id=$1', [id]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query(
        'insert into public.feedback_items(id,owner_id,title,created_at) values($1,$2,$3,now())',
        [randomUUID(), owner, 'steal'],
      ),
    /permission denied/,
  );
  await asUser(owner);
  const deletion = randomUUID();
  assert.equal(await feedback(deletion, id, 3, { ...value, deleted: true }), 4);
  assert.equal(await feedback(deletion, id, 3, { ...value, deleted: true }), 4);
  assert.equal(await feedback(mutation, id, 0, value), 1);
  await assert.rejects(() => feedback(randomUUID(), id, 4, value), /deleted/);
  assert.equal(
    (await db.query('select deleted from public.feedback_items where id=$1', [id])).rows[0].deleted,
    true,
  );
  const program = JSON.parse(
    await readFile(new URL('../docs/examples/foundation.json', import.meta.url), 'utf8'),
  );
  const programId = (
    await db.query('select public.save_program($1::jsonb) as id', [JSON.stringify(program)])
  ).rows[0].id;
  await db.query('select public.assign_program($1,$2,$3)', [programId, owner, '2026-11-01']);
  const read = async () => (await db.query('select public.get_my_sessions() as data')).rows[0].data;
  const s = (await read())[0];
  assert.equal((await db.query('select * from public.exercise_results')).rows.length, 0);
  await assert.rejects(
    () =>
      db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
        randomUUID(),
        s.id,
        JSON.stringify({ deleted: true, status: 'scheduled', finishedAt: null, results: [] }),
      ]),
    /Unstarted programming cannot be deleted/,
  );
  assert.equal((await read()).find((w) => w.id === s.id).deleted, false);
  const log = {
    status: 'finished',
    finishedAt: new Date().toISOString(),
    results: s.blocks
      .flatMap((b) => b.entries)
      .map((e) => ({ entryId: e.id, completed: e.eligible, load: '', notes: '' })),
  };
  const entry = log.results.find((e) => e.completed);
  entry.load = '24 kg';
  await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
    randomUUID(),
    s.id,
    JSON.stringify(log),
  ]);
  assert.equal(
    (await db.query('select * from public.exercise_results')).rows.length,
    log.results.filter((e) => e.completed).length,
  );
  Object.assign(entry, { completed: false, load: '', notes: '' });
  const resultDeletion = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query('select public.apply_session_mutation($1,$2,1,$3::jsonb)', [
      resultDeletion,
      s.id,
      JSON.stringify(log),
    ]);
  assert.equal(
    (await db.query('select * from public.exercise_results where entry_id=$1', [entry.entryId]))
      .rows.length,
    0,
  );
  const next = (await read()).find((w) => w.id === s.id);
  assert.equal(next.status, 'finished');
  assert.equal(
    next.blocks.flatMap((b) => b.entries).find((e) => e.id === entry.entryId).completed,
    false,
  );
  assert.equal(
    next.blocks.flatMap((b) => b.entries).length,
    s.blocks.flatMap((b) => b.entries).length,
  );
  assert.equal(
    (await db.query('select public.get_program($1) as data', [programId])).rows[0].data.name,
    program.name,
  );
  // Delete the complete workout occurrence and children; retain identity and receipts.
  const deleteId = randomUUID(),
    deleteLog = { deleted: true, status: 'scheduled', finishedAt: null, results: [] };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await db.query('select public.apply_session_mutation($1,$2,2,$3::jsonb) as v', [
          deleteId,
          s.id,
          JSON.stringify(deleteLog),
        ])
      ).rows[0].v,
      3,
    );
  const tombstone = (await read()).find((w) => w.id === s.id);
  assert.equal(tombstone.deleted, true);
  assert.deepEqual(tombstone.blocks, []);
  assert.equal(
    (
      await db.query('select count(*)::int as n from public.session_blocks where session_id=$1', [
        s.id,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        'select count(*)::int as n from public.session_entries where id=any($1::uuid[])',
        [log.results.map((r) => r.entryId)],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        'select count(*)::int as n from public.exercise_results where entry_id=any($1::uuid[])',
        [log.results.map((r) => r.entryId)],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query('select public.apply_session_mutation($1,$2,1,$3::jsonb) as v', [
        resultDeletion,
        s.id,
        JSON.stringify(log),
      ])
    ).rows[0].v,
    2,
  );
  await assert.rejects(
    () =>
      db.query('select public.apply_session_mutation($1,$2,3,$3::jsonb)', [
        randomUUID(),
        s.id,
        JSON.stringify(log),
      ]),
    /VERSION_CONFLICT.*deleted/,
  );
  assert.equal(
    (await db.query('select count(*)::int as n from public.exercises')).rows[0].n > 0,
    true,
  );
  assert.equal(
    (await db.query('select public.get_program($1) as data', [programId])).rows[0].data.name,
    program.name,
  );
  const kept = (await read()).find((w) => w.id !== s.id);
  const keptLog = {
    status: 'finished',
    finishedAt: new Date().toISOString(),
    results: kept.blocks
      .flatMap((b) => b.entries)
      .map((e) => ({ entryId: e.id, completed: e.eligible, load: '', notes: '' })),
  };
  await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
    randomUUID(),
    kept.id,
    JSON.stringify(keptLog),
  ]);
  await db.query('select public.remove_program($1)', [programId]);
  const detached = (await read()).filter((w) => !w.deleted);
  assert.equal(detached.filter((w) => w.id === kept.id).length, 1);
  assert.equal(detached.find((w) => w.id === kept.id).assignmentId, null);
  assert.equal(detached.find((w) => w.id === kept.id).status, 'finished');
  assert.equal((await read()).find((w) => w.id === s.id).deleted, true);
  assert.equal(
    (
      await db.query('select public.apply_session_mutation($1,$2,2,$3::jsonb) as v', [
        deleteId,
        s.id,
        JSON.stringify(deleteLog),
      ])
    ).rows[0].v,
    3,
  );
  await asUser(other);
  await assert.rejects(
    () =>
      db.query('select public.apply_session_mutation($1,$2,2,$3::jsonb)', [
        randomUUID(),
        s.id,
        JSON.stringify(log),
      ]),
    /unavailable/,
  );
  await db.exec('reset role; set role anon');
  await assert.rejects(() => feedback(randomUUID(), id, 4, value), /permission denied/);
  console.log(
    'History deletion, sparse results, feedback lifecycle, retry, conflict, tombstone and authorization checks passed.',
  );
} finally {
  await db.close();
}
