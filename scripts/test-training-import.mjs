// Disposable PostgreSQL, the real RPCs and authenticated role; no hosted state.
import { createTestDatabase } from './test-database.mjs';
import { parseProgram } from '../src/lib/import.ts';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = await createTestDatabase();
const owner = '11111111-1111-4111-8111-111111111111';
const program = parseProgram(await readFile('docs/integration/trainer-example.json', 'utf8'));
const save = async (p, replace = null) =>
  (await db.query('select public.save_program($1::jsonb,$2) as id', [JSON.stringify(p), replace]))
    .rows[0].id;
const sessions = async () =>
  (await db.query('select public.get_my_sessions() as data')).rows[0].data;
try {
  await db.query('insert into auth.users(id) values($1)', [owner]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'coach')", [owner]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const id = await save(program);
  await assert.rejects(() => save(program), /Duplicate program/);
  const roundtrip = (await db.query('select public.get_program($1) as data', [id])).rows[0].data;
  assert.equal(roundtrip.schemaVersion, 2);
  assert.deepEqual(roundtrip.weeks[0].workouts[0].blocks, program.weeks[0].workouts[0].blocks);
  await db.query('select public.assign_program($1,$2,$3)', [id, owner, '2026-11-02']);
  const snapshots = await sessions();
  assert.deepEqual(
    snapshots.map((s) => s.title),
    program.weeks[0].workouts.map((w) => w.title),
  );
  assert.deepEqual(
    snapshots[0].blocks[1].entries[0].prescription,
    program.weeks[0].workouts[0].blocks[1].entries[0].prescription,
  );
  assert.equal(snapshots[0].provenance.version, 1);
  assert.equal(snapshots[0].provenance.name, program.name);
  // Record an incomplete finished workout using the exact existing offline mutation shape.
  const snapshot = snapshots[0];
  const log = {
    status: 'finished',
    finishedAt: '2026-11-02T18:00:00Z',
    results: snapshot.blocks
      .flatMap((b) => b.entries)
      .map((e, i) => ({
        entryId: e.id,
        completed: i === 0,
        load: i === 0 ? '20 kg' : '',
        notes: '',
      })),
  };
  const mutation = '99999999-9999-4999-8999-999999999999';
  await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
    mutation,
    snapshot.id,
    JSON.stringify(log),
  ]);
  const recorded = (await sessions())[0];
  const revision = structuredClone(program);
  revision.description = 'Revised objectives';
  revision.weeks[0].workouts[0].blocks[1].entries[0].prescription.targetRpe = 6;
  await save(revision, id);
  assert.deepEqual((await sessions())[0], recorded);
  await db.query('select public.assign_program($1,$2,$3)', [id, owner, '2026-11-09']);
  const newer = (await sessions()).find((s) => s.date === '2026-11-09');
  assert.equal(newer.provenance.version, 2);
  assert.equal(newer.blocks[1].entries[0].prescription.targetRpe, 6);
  assert.equal(newer.blocks[1].entries[0].exerciseId, recorded.blocks[1].entries[0].exerciseId);
  // Bypass the browser: SQL must reject every malformed field rather than dropping it.
  for (const [name, change, pattern] of [
    [
      'unknown root',
      (p) => {
        p.results = [];
      },
      /Unknown field/,
    ],
    [
      'unknown nested',
      (p) => {
        p.weeks[0].workouts[0].blocks[1].entries[0].prescription.setDetails[0].actualReps = 5;
      },
      /Unknown field/,
    ],
    [
      'effort bound',
      (p) => {
        p.weeks[0].workouts[0].blocks[1].entries[0].prescription.targetRpe = 11;
      },
      /targetRpe/,
    ],
    [
      'percentage denominator',
      (p) => {
        delete p.weeks[0].workouts[0].blocks[1].entries[0].prescription.percentage.reference;
      },
      /reference/,
    ],
    [
      'ambiguous sets',
      (p) => {
        p.weeks[0].workouts[0].blocks[1].entries[0].prescription.sets = 3;
      },
      /sets or setDetails/,
    ],
    [
      'missing group protocol',
      (p) => {
        p.weeks[0].workouts[0].blocks[2].instructions = '';
      },
      /protocol/,
    ],
    [
      'inconsistent repeated identity',
      (p) => {
        p.weeks[0].workouts[2].blocks[1].entries[0].name = 'Different row';
      },
      /Conflicting/,
    ],
    [
      'instruction eligibility',
      (p) => {
        p.weeks[0].workouts[0].blocks[1].kind = 'instruction';
      },
      /Instruction/,
    ],
    [
      'unsafe URL',
      (p) => {
        p.weeks[0].workouts[0].blocks[1].entries[0].referenceUrl = 'javascript:alert(1)';
      },
      /http/,
    ],
    [
      'unknown version',
      (p) => {
        p.schemaVersion = 99;
      },
      /Supported versions/,
    ],
  ]) {
    const invalid = structuredClone(program);
    change(invalid);
    await assert.rejects(() => save(invalid), pattern, name);
  }
  // A stale preview must not silently switch to another canonical movement name/video.
  await db.query(
    "update public.exercises set name='Canonical paused bench' where exercise_key='barbell-bench-press-paused'",
  );
  await assert.rejects(
    () => save({ ...program, name: 'Stale import' }),
    /Validate and preview again/,
  );
  const beforeRemove = (await sessions()).find((s) => s.id === recorded.id);
  await db.query('select public.remove_program($1)', [id]);
  const detached = (await sessions()).find((s) => s.id === recorded.id);
  assert.equal(detached.assignmentId, null);
  assert.deepEqual(detached.provenance, beforeRemove.provenance);
  assert.deepEqual(detached.blocks, beforeRemove.blocks);
  assert.equal(detached.status, 'finished');
  // Retry of the original queued mutation still receives its original acknowledgement.
  const retry = (
    await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb) as ack', [
      mutation,
      snapshot.id,
      JSON.stringify(log),
    ])
  ).rows[0].ack;
  assert.equal(retry, 1);
  console.log(
    '✓ V2 delivery, strict SQL validation, canonical conflicts, ordering, revisions, finished history, provenance and sync receipts',
  );
} finally {
  await db.close();
}
