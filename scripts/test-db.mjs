import { createTestDatabase } from './test-database.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = await createTestDatabase();
let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions++;
  console.log(`✓ ${message}`);
}
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  athlete = '33333333-3333-4333-8333-333333333333';
async function asUser(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
async function fails(sql, params, pattern, message) {
  await assert.rejects(() => db.query(sql, params), pattern);
  assertions++;
  console.log(`✓ ${message}`);
}
try {
  check(true, 'Migration applies to fresh PostgreSQL');
  await db.query('insert into auth.users(id) values($1),($2),($3)', [owner, other, athlete]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'coach')", [owner]);
  await asUser(owner);
  check(
    (await db.query('select role from public.user_roles')).rows.length === 2,
    'One account has athlete and coach capabilities',
  );
  await fails(
    "insert into public.user_roles(user_id,role) values($1,'coach')",
    [other],
    /permission denied/,
    'Users cannot grant capabilities',
  );
  const input = JSON.parse(
    await readFile(new URL('../docs/examples/foundation.json', import.meta.url), 'utf8'),
  );
  const { id: program } = (
    await db.query('select public.save_program($1::jsonb) as id', [JSON.stringify(input)])
  ).rows[0];
  check(Boolean(program), 'Coach imports a validated program');
  await fails(
    'select public.save_program($1::jsonb)',
    [JSON.stringify(input)],
    /Duplicate program/,
    'Duplicate imports are rejected',
  );
  await fails(
    'select public.save_program($1::jsonb)',
    [
      JSON.stringify({
        schemaVersion: 1,
        name: 'Bad',
        weeks: [{ week: 1, workouts: [{ day: 9, title: 'Bad', blocks: [] }] }],
      }),
    ],
    /Invalid workout/,
    'Server independently rejects invalid import',
  );
  const { id: assignment } = (
    await db.query('select public.assign_program($1,$2,$3) as id', [program, owner, '2026-11-02'])
  ).rows[0];
  check(Boolean(assignment), 'Dual-role user assigns a program to self');
  await fails(
    'select public.assign_program($1,$2,$3)',
    [program, owner, '2026-11-02'],
    /already assigned/,
    'Duplicate assignments are rejected',
  );
  let snapshots = (await db.query('select public.get_my_sessions() as data')).rows[0].data;
  check(snapshots.length === 3, 'Assignment creates all ordered scheduled workouts');
  const session = snapshots[0];
  check(
    session.blocks[1].entries[0].label === 'B1' && session.blocks[1].entries[1].label === 'B2',
    'Import preserves superset grouping and labels',
  );
  // Use a purpose-built 10-entry program to test the exact product invariant.
  const ten = {
    schemaVersion: 1,
    name: 'Ten movements',
    description: 'Regression fixture',
    weeks: [
      {
        week: 1,
        workouts: [
          {
            day: 1,
            title: '10 exercise session',
            blocks: [
              {
                label: 'A',
                kind: 'circuit',
                instructions: '',
                entries: Array.from({ length: 10 }, (_, i) => ({
                  exerciseKey: `movement-${i}`,
                  name: `Movement ${i}`,
                  label: `A${i + 1}`,
                  eligible: true,
                  aliases: [],
                  prescription: { reps: '10' },
                  instructions: '',
                })),
              },
            ],
          },
        ],
      },
    ],
  };
  const tenId = (
    await db.query('select public.save_program($1::jsonb) as id', [JSON.stringify(ten)])
  ).rows[0].id;
  await db.query('select public.assign_program($1,$2,$3)', [tenId, owner, '2026-11-04']);
  snapshots = (await db.query('select public.get_my_sessions() as data')).rows[0].data;
  const target = snapshots.find((s) => s.title === '10 exercise session');
  const log = {
    status: 'finished',
    finishedAt: '2026-11-04T15:00:00Z',
    results: target.blocks
      .flatMap((b) => b.entries)
      .map((e, i) => ({
        entryId: e.id,
        completed: i < 9,
        load: i === 0 ? '24 kg' : '',
        notes: i === 0 ? 'Controlled tempo' : '',
      })),
  };
  const mutation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  check(
    (
      await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb) as version', [
        mutation,
        target.id,
        JSON.stringify(log),
      ])
    ).rows[0].version === 1,
    'Session mutation increments server version',
  );
  check(
    (
      await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb) as version', [
        mutation,
        target.id,
        JSON.stringify(log),
      ])
    ).rows[0].version === 1,
    'Retry returns the same acknowledgement',
  );
  let persisted = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.id === target.id,
  );
  check(
    persisted.status === 'finished' &&
      persisted.finishedAt &&
      persisted.blocks.flatMap((b) => b.entries).filter((e) => e.completed).length === 9,
    '9/10 + Finish persists finished at 90%, without checking the tenth',
  );
  check(
    (await db.query('select * from public.sync_receipts where mutation_id=$1', [mutation])).rows
      .length === 1,
    'A logical mutation has exactly one receipt',
  );
  await fails(
    'select public.apply_session_mutation($1,$2,0,$3::jsonb)',
    ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', target.id, JSON.stringify(log)],
    /VERSION_CONFLICT/,
    'Stale concurrent edits produce an explicit conflict',
  );
  await fails(
    'select public.apply_session_mutation($1,$2,null,$3::jsonb)',
    ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', target.id, JSON.stringify(log)],
    /VERSION_CONFLICT/,
    'A null base version cannot bypass conflict detection',
  );
  const before = JSON.stringify(persisted.blocks);
  ten.weeks[0].workouts[0].blocks[0].entries[0].prescription = { reps: '999' };
  ten.weeks[0].workouts[0].title = 'Updated template';
  await db.query('select public.save_program($1::jsonb,$2)', [JSON.stringify(ten), tenId]);
  persisted = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.id === target.id,
  );
  check(
    JSON.stringify(persisted.blocks) === before && persisted.title === '10 exercise session',
    'Editing templates preserves the actual historical prescription and results',
  );
  check(
    (await db.query('select public.get_program($1) as data', [tenId])).rows[0].data.weeks[0]
      .workouts[0].title === 'Updated template',
    'Reusable program edits are saved separately',
  );
  await asUser(other);
  check(
    (await db.query('select * from public.workout_sessions')).rows.length === 0,
    'RLS hides another athlete’s sessions',
  );
  check(
    (await db.query('select * from public.exercise_results')).rows.length === 0,
    'RLS hides another athlete’s results',
  );
  check(
    (await db.query('select public.get_my_sessions() as data')).rows[0].data.length === 0,
    'Read RPC respects RLS',
  );
  check(
    (await db.query('select public.get_program($1) as data', [tenId])).rows[0].data === null,
    'Read RPC hides another coach’s program',
  );
  await fails(
    'select public.apply_session_mutation($1,$2,1,$3::jsonb)',
    ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', target.id, JSON.stringify(log)],
    /Workout unavailable/,
    'A different user cannot mutate another athlete’s log',
  );
  await fails(
    'update public.workout_sessions set title=$1 where id=$2',
    ['Tampered', target.id],
    /permission denied/,
    'Direct writes cannot bypass mutation validation',
  );
  await fails(
    'select public.save_program($1::jsonb)',
    [JSON.stringify(input)],
    /Coach capability/,
    'Athlete cannot invoke coach import',
  );
  await asUser(owner);
  await fails(
    'select public.assign_program($1,$2,$3)',
    [program, athlete, '2026-11-02'],
    /accept coaching/,
    'Coach cannot assign to an unconsenting athlete',
  );
  await db.query('select public.request_coaching($1)', [athlete]);
  await asUser(athlete);
  await db.query('select public.respond_coaching($1,true)', [owner]);
  await asUser(owner);
  await db.query('select public.assign_program($1,$2,$3)', [program, athlete, '2026-11-02']);
  check(
    (await db.query('select * from public.workout_sessions where athlete_id=$1', [athlete])).rows
      .length === 3,
    'Accepted coaching relationship allows assignment and review',
  );
  await asUser(athlete);
  await db.query('select public.respond_coaching($1,false)', [owner]);
  await asUser(owner);
  check(
    (await db.query('select * from public.workout_sessions where athlete_id=$1', [athlete])).rows
      .length === 0,
    'Revoking coaching removes access without deleting history',
  );
  const reopen = { ...log, status: 'in_progress', finishedAt: null };
  await db.query('select public.apply_session_mutation($1,$2,1,$3::jsonb)', [
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    target.id,
    JSON.stringify(reopen),
  ]);
  persisted = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.id === target.id,
  );
  check(
    persisted.status === 'in_progress' &&
      !persisted.finishedAt &&
      persisted.blocks.flatMap((b) => b.entries).filter((e) => e.completed).length === 9,
    'Reopening preserves results and clears finalization timestamp',
  );
  await db.exec('reset role');
  await db.exec('set role anon');
  await fails(
    'select * from public.workout_sessions',
    [],
    /permission denied/,
    'Anonymous users cannot read training tables',
  );
  await fails(
    'select public.get_my_sessions()',
    [],
    /permission denied/,
    'Anonymous users cannot invoke training RPCs',
  );
  console.log(
    `\n${assertions} database assertions passed (PGlite PostgreSQL; auth.uid test shim).`,
  );
} catch (error) {
  console.error({
    message: error.message,
    position: error.position,
    detail: error.detail,
    where: error.where,
  });
  process.exitCode = 1;
} finally {
  await db.close();
}
