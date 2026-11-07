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
            description: 'Keep three reps in reserve.\nRecord your actual load.',
            category: 'Strength',
            estimatedMinutes: 45,
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
  check(
    target.description === ten.weeks[0].workouts[0].description &&
      target.category === 'Strength' &&
      target.estimatedMinutes === 45,
    'Assignment preserves workout description, category and estimated duration',
  );
  const malformed = structuredClone(ten);
  malformed.weeks[0].workouts[0].estimatedMinutes = -1;
  await fails(
    'select public.save_program($1::jsonb)',
    [JSON.stringify(malformed)],
    /Invalid workout duration/,
    'Server independently validates optional workout details',
  );
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
  const foreignLog = structuredClone(log);
  foreignLog.results[0].entryId = session.blocks[0].entries[0].id;
  await fails(
    'select public.apply_session_mutation($1,$2,0,$3::jsonb)',
    [mutation, target.id, JSON.stringify(foreignLog)],
    /Invalid entry/,
    'A log cannot reference an entry in a different workout',
  );
  const duplicateLog = structuredClone(log);
  duplicateLog.results[1].entryId = duplicateLog.results[0].entryId;
  await fails(
    'select public.apply_session_mutation($1,$2,0,$3::jsonb)',
    [mutation, target.id, JSON.stringify(duplicateLog)],
    /exactly once/,
    'A log cannot omit an entry by repeating another',
  );
  await fails(
    'select public.apply_session_mutation($1,$2,0,$3::jsonb)',
    [mutation, target.id, JSON.stringify({ ...log, finishedAt: null })],
    /timestamp must match status/,
    'Finished logs require a timestamp',
  );
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
  ten.weeks[0].workouts[0].description = 'Changed description';
  ten.weeks[0].workouts[0].category = 'Conditioning';
  ten.weeks[0].workouts[0].estimatedMinutes = 30;
  await db.query('select public.save_program($1::jsonb,$2)', [JSON.stringify(ten), tenId]);
  persisted = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.id === target.id,
  );
  check(
    JSON.stringify(persisted.blocks) === before &&
      persisted.title === '10 exercise session' &&
      persisted.description === target.description &&
      persisted.category === 'Strength' &&
      persisted.estimatedMinutes === 45,
    'Editing templates preserves the actual historical prescription and results',
  );
  check(
    (await db.query('select public.get_program($1) as data', [tenId])).rows[0].data.weeks[0]
      .workouts[0].title === 'Updated template',
    'Reusable program edits are saved separately',
  );
  const exerciseId = persisted.blocks[0].entries[0].exerciseId;
  await fails(
    'update public.exercises set exercise_key=$1 where id=$2',
    ['replaced-key', exerciseId],
    /permission denied/,
    'Stable exercise keys cannot be changed through the API',
  );
  await fails(
    'update public.exercises set owner_id=$1 where id=$2',
    [other, exerciseId],
    /permission denied/,
    'Exercise ownership cannot be transferred through the API',
  );
  await db.query('update public.exercises set name=$1,reference_url=$2 where id=$3', [
    'Renamed movement',
    'https://example.com/reference',
    exerciseId,
  ]);
  let history = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.id === target.id,
  );
  check(
    JSON.stringify(history.blocks) === before,
    'Library edits preserve historical names, references, prescriptions and results',
  );
  await db.query('select public.assign_program($1,$2,$3)', [tenId, owner, '2026-12-01']);
  const future = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.date === '2026-12-01',
  );
  check(
    future.description === 'Changed description' &&
      future.category === 'Conditioning' &&
      future.estimatedMinutes === 30,
    'New assignments snapshot edited workout details without changing previous sessions',
  );
  check(
    future.blocks[0].entries[0].exerciseId === exerciseId &&
      future.blocks[0].entries[0].name === 'Renamed movement',
    'Future assignments use updated library details with the same exercise identity',
  );
  await asUser(other);
  check(
    (
      await db.query('update public.exercises set name=$1 where id=$2 returning id', [
        'Tampered',
        exerciseId,
      ])
    ).rows.length === 0,
    'RLS prevents an unrelated athlete from changing library details',
  );
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
  await db.exec('reset role');
  await db.query("insert into public.user_roles(user_id,role) values($1,'coach')", [other]);
  await asUser(other);
  await fails(
    'select public.save_program($1::jsonb,$2)',
    [JSON.stringify(ten), tenId],
    /Program unavailable/,
    'A different coach cannot replace an owned program using its ID',
  );
  await fails(
    'select public.assign_program($1,$2,$3)',
    [tenId, other, '2026-12-01'],
    /Program unavailable/,
    'A different coach cannot assign an owned program using its ID',
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
  // Removal must unassign every athlete without destroying offline mutation targets or history.
  await db.query('select public.assign_program($1,$2,$3)', [tenId, owner, '2099-01-01']);
  const pendingOffline = (
    await db.query('select public.get_my_sessions() as data')
  ).rows[0].data.find((s) => s.date === '2099-01-01');
  await db.query('select public.assign_program($1,$2,$3)', [tenId, owner, '2000-01-01']);
  await db.query('select public.request_coaching($1)', [athlete]);
  await asUser(athlete);
  await db.query('select public.respond_coaching($1,true)', [owner]);
  await asUser(owner);
  await db.query('select public.assign_program($1,$2,$3)', [tenId, athlete, '2099-01-01']);
  await asUser(athlete);
  const athleteUpcoming = (
    await db.query('select public.get_my_sessions() as data')
  ).rows[0].data.find((s) => s.date === '2099-01-01');
  await fails(
    'select public.remove_program($1)',
    [tenId],
    /Coach capability required/,
    'Athletes cannot remove their assigned program',
  );
  await db.query('select public.respond_coaching($1,false)', [owner]);
  await asUser(other);
  await fails(
    'select public.remove_program($1)',
    [tenId],
    /Program unavailable/,
    'Another coach cannot remove a program by ID',
  );
  await asUser(owner);
  const reusableIds = (
    await db.query(
      `select w.id as week,t.id as workout,b.id as block,e.id as entry
       from public.program_weeks w join public.workout_templates t on t.week_id=w.id
       join public.template_blocks b on b.workout_id=t.id
       join public.template_entries e on e.block_id=b.id where w.program_id=$1`,
      [tenId],
    )
  ).rows;
  await db.query('select public.remove_program($1)', [tenId]);
  check(
    (await db.query('select * from public.programs where id=$1', [tenId])).rows.length === 0 &&
      (await db.query('select * from public.program_assignments where program_id=$1', [tenId])).rows
        .length === 0,
    'Removal deletes the program and its assignments',
  );
  for (const [table, key] of [
    ['program_weeks', 'week'],
    ['workout_templates', 'workout'],
    ['template_blocks', 'block'],
    ['template_entries', 'entry'],
  ]) {
    check(
      (
        await db.query(`select id from public.${table} where id=any($1::uuid[])`, [
          reusableIds.map((r) => r[key]),
        ])
      ).rows.length === 0,
      `Removal deletes all program ${table}`,
    );
  }
  snapshots = (await db.query('select public.get_my_sessions() as data')).rows[0].data;
  history = snapshots.find((s) => s.id === target.id);
  check(
    history.assignmentId === null &&
      history.version === persisted.version &&
      JSON.stringify(history.blocks) === JSON.stringify(persisted.blocks) &&
      snapshots.some((s) => s.date === '2000-01-01') &&
      !snapshots.some((s) => s.id === pendingOffline.id),
    'Removal preserves logged and past workouts while withdrawing upcoming unstarted workouts',
  );
  check(
    (await db.query('select * from public.exercises where id=$1', [exerciseId])).rows.length ===
      1 &&
      (await db.query('select * from public.sync_receipts where mutation_id=$1', [mutation])).rows
        .length === 1,
    'Removal preserves stable exercises and idempotency receipts',
  );
  check(
    (
      await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb) as version', [
        mutation,
        target.id,
        JSON.stringify(log),
      ])
    ).rows[0].version === 1,
    'An old acknowledged mutation remains idempotent after program removal',
  );
  await fails(
    'select public.assign_program($1,$2,$3)',
    [tenId, owner, '2099-02-01'],
    /Program unavailable/,
    'A deleted program cannot be assigned again',
  );
  await asUser(athlete);
  check(
    (await db.query('select * from public.program_assignments where program_id=$1', [tenId])).rows
      .length === 0 &&
      !(await db.query('select public.get_my_sessions() as data')).rows[0].data.some(
        (s) => s.id === athleteUpcoming.id,
      ),
    'Removal unassigns and withdraws workouts even after an athlete revokes coaching access',
  );
  const offlineLog = {
    status: 'in_progress',
    finishedAt: null,
    results: athleteUpcoming.blocks.flatMap((b) =>
      b.entries.map((e, i) => ({
        entryId: e.id,
        completed: i === 0,
        load: i === 0 ? '32 kg' : '',
        notes: i === 0 ? 'Saved offline before removal' : '',
      })),
    ),
  };
  const offlineMutation = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  for (let attempt = 0; attempt < 2; attempt++)
    check(
      (
        await db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb) as version', [
          offlineMutation,
          athleteUpcoming.id,
          JSON.stringify(offlineLog),
        ])
      ).rows[0].version === 1,
      `Pending offline edits after removal synchronize idempotently (attempt ${attempt + 1})`,
    );
  const recovered = (await db.query('select public.get_my_sessions() as data')).rows[0].data.find(
    (s) => s.id === athleteUpcoming.id,
  );
  check(
    recovered.assignmentId === null && recovered.blocks[0].entries[0].load === '32 kg',
    'A withdrawn workout with offline edits returns to history without restoring the assignment',
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
  await fails(
    'select public.remove_program($1)',
    [program],
    /permission denied/,
    'Anonymous users cannot remove programs',
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
