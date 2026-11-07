// Opt-in REAL local GoTrue + PostgREST integration. Never accepts a hosted target.
// All created records belong to fresh random accounts and are cleaned up in finally.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

let status;
try {
  status = JSON.parse(
    execFileSync('npx', ['supabase', 'status', '--output', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
} catch {
  // A child-process error can include captured credential output. Never propagate it.
  throw new Error('Local Supabase status is unavailable. Start the PRGRS Docker stack and retry.');
}
const origin = new URL(status.API_URL);
assert.equal(
  origin.origin,
  'http://127.0.0.1:54321',
  'Only the repository local stack is supported',
);
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  },
};
const admin = createClient(origin.origin, status.SERVICE_ROLE_KEY, options);
const accounts = [];
let assertions = 0;
function check(value, label) {
  assert.ok(value, label);
  assertions++;
  console.log(`✓ ${label}`);
}
function data(result) {
  if (result.error)
    throw new Error(`Local API failed (${result.error.code || result.error.status || 'unknown'})`);
  return result.data;
}
function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_PRGRS',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
    ],
    {
      input: statement,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}
try {
  for (let i = 0; i < 2; i++) {
    const client = createClient(origin.origin, status.ANON_KEY, options);
    const credentials = {
      email: `prgrs-release-${randomUUID()}@example.com`,
      password: randomUUID() + 'Aa1!',
    };
    const response = await client.auth.signUp({
      ...credentials,
      options: { data: { name: 'Release test', role: 'coach', timezone: 'America/Costa_Rica' } },
    });
    if (response.data.user) accounts.push({ client, id: response.data.user.id, credentials });
    assert.ifError(response.error);
    check(Boolean(response.data.session), 'Real local signup issues an authenticated session');
  }
  const [a, b] = accounts;
  check(
    data(await a.client.from('user_roles').select('role')).every((r) => r.role === 'athlete'),
    'Signup metadata cannot provision coach capability',
  );
  check(
    data(await a.client.from('profiles').select('timezone').single()).timezone ===
      'America/Costa_Rica',
    'Real Auth signup trigger provisions the profile',
  );
  sql(`insert into public.user_roles(user_id,role) values ('${a.id}','coach');`);
  check(
    data(await a.client.from('user_roles').select('role')).length === 2,
    'Trusted role provisioning enables dual capabilities through PostgREST',
  );
  const program = {
    schemaVersion: 1,
    name: 'Local release verification',
    weeks: [
      {
        week: 1,
        workouts: [
          {
            day: 1,
            title: 'Ten movements',
            blocks: [
              {
                label: 'A',
                kind: 'circuit',
                entries: Array.from({ length: 10 }, (_, i) => ({
                  exerciseKey: `test-${i}`,
                  name: `Exercise ${i}`,
                  label: `A${i + 1}`,
                })),
              },
            ],
          },
        ],
      },
    ],
  };
  const programId = data(await a.client.rpc('save_program', { p_program: program }));
  data(
    await a.client.rpc('assign_program', {
      p_program: programId,
      p_athlete: a.id,
      p_start: '2026-11-07',
    }),
  );
  const [session] = data(await a.client.rpc('get_my_sessions'));
  check(
    session.blocks[0].entries.length === 10,
    'Real PostgREST imports, assigns and retrieves the session snapshot',
  );
  const log = {
    status: 'finished',
    finishedAt: new Date().toISOString(),
    results: session.blocks[0].entries.map((e, i) => ({
      entryId: e.id,
      completed: i < 9,
      load: i === 0 ? '24 kg' : '',
      notes: '',
    })),
  };
  const mutation = { p_id: randomUUID(), p_session: session.id, p_base_version: 0, p_log: log };
  check(
    data(await a.client.rpc('apply_session_mutation', mutation)) === 1,
    'Real API acknowledges finalization',
  );
  check(
    data(await a.client.rpc('apply_session_mutation', mutation)) === 1,
    'Real API retries return the original acknowledgement',
  );
  const [finished] = data(await a.client.rpc('get_my_sessions'));
  check(
    finished.status === 'finished' &&
      finished.blocks[0].entries.filter((e) => e.completed).length === 9,
    'Real API persists finished at exactly 9/10',
  );
  check(
    data(await a.client.from('sync_receipts').select('mutation_id')).length === 1,
    'Retry creates exactly one real receipt',
  );
  for (const table of [
    'programs',
    'program_weeks',
    'workout_templates',
    'template_blocks',
    'template_entries',
    'program_assignments',
    'workout_sessions',
    'session_blocks',
    'session_entries',
    'exercise_results',
    'exercises',
    'sync_receipts',
  ]) {
    check(
      data(await b.client.from(table).select('*')).length === 0,
      `Unrelated JWT cannot read ${table}`,
    );
  }
  check(
    Boolean((await b.client.rpc('apply_session_mutation', mutation)).error),
    'Unrelated JWT cannot mutate the session',
  );
  check(
    Boolean((await b.client.from('user_roles').insert({ user_id: b.id, role: 'coach' })).error),
    'Browser API rejects role escalation',
  );
  check(
    Boolean((await b.client.rpc('save_program', { p_program: program })).error),
    'Athlete JWT cannot import programs',
  );
  data(await a.client.rpc('request_coaching', { p_athlete: b.id }));
  check(
    Boolean(
      (
        await a.client.rpc('assign_program', {
          p_program: programId,
          p_athlete: b.id,
          p_start: '2026-11-07',
        })
      ).error,
    ),
    'Pending coach relationship cannot assign',
  );
  data(await b.client.rpc('respond_coaching', { p_coach: a.id, p_accept: true }));
  data(
    await a.client.rpc('assign_program', {
      p_program: programId,
      p_athlete: b.id,
      p_start: '2026-11-07',
    }),
  );
  check(
    data(await b.client.rpc('get_my_sessions')).length === 1,
    'Assigned athlete can retrieve their real training',
  );
  check(
    data(await a.client.rpc('get_my_sessions')).length === 2,
    'Accepted coach can review assigned athlete',
  );
  data(await b.client.rpc('respond_coaching', { p_coach: a.id, p_accept: false }));
  check(
    data(await a.client.rpc('get_my_sessions')).length === 1,
    'Revocation immediately removes coach API access',
  );
  const anonymous = createClient(origin.origin, status.ANON_KEY, options);
  check(
    Boolean((await anonymous.rpc('get_my_sessions')).error),
    'Anonymous RPC access is denied by real PostgREST',
  );
  check(
    Boolean((await anonymous.from('workout_sessions').select('*')).error),
    'Anonymous table access is denied by real PostgREST',
  );
  data(await b.client.auth.signOut({ scope: 'local' }));
  check(
    !(await b.client.auth.getSession()).data.session,
    'Real local signout removes the device session',
  );
  data(await b.client.auth.signInWithPassword(b.credentials));
  check(
    Boolean((await b.client.auth.getSession()).data.session),
    'Real password sign-in restores authentication',
  );
  if (process.env.PRGRS_PROFILE_HISTORY === '1') {
    const workload = structuredClone(program);
    workload.name = 'Local history profile';
    workload.weeks = Array.from({ length: 12 }, (_, week) => ({
      week: week + 1,
      workouts: Array.from({ length: 7 }, (_, day) => ({
        ...structuredClone(program.weeks[0].workouts[0]),
        day: day + 1,
      })),
    }));
    const workloadId = data(await a.client.rpc('save_program', { p_program: workload }));
    data(
      await a.client.rpc('assign_program', {
        p_program: workloadId,
        p_athlete: a.id,
        p_start: '2026-01-01',
      }),
    );
    const started = performance.now();
    const snapshots = data(await a.client.rpc('get_my_sessions'));
    const milliseconds = Math.round(performance.now() - started);
    const bytes = Buffer.byteLength(JSON.stringify(snapshots));
    check(
      snapshots.length === 85,
      'Representative history returns 85 sessions and 850 exercise entries',
    );
    console.log(
      `Local history RPC: ${milliseconds} ms; ${bytes} JSON bytes (loopback, one sample; not a hosted SLA).`,
    );
  }
  console.log(`\n${assertions} real local Auth/PostgREST assertions passed.`);
} finally {
  // Scope cleanup exclusively to random UUIDs created by this invocation. Never reset the stack.
  for (const { id } of accounts) assert.match(id, /^[0-9a-f-]{36}$/);
  if (accounts.length) {
    const ids = accounts.map((a) => `'${a.id}'::uuid`).join(',');
    sql(`begin;
      delete from public.exercise_results where entry_id in (select e.id from public.session_entries e join public.session_blocks b on b.id=e.block_id join public.workout_sessions s on s.id=b.session_id where s.athlete_id in (${ids}));
      delete from public.sync_receipts where athlete_id in (${ids});
      delete from public.session_entries where block_id in (select b.id from public.session_blocks b join public.workout_sessions s on s.id=b.session_id where s.athlete_id in (${ids}));
      delete from public.session_blocks where session_id in (select id from public.workout_sessions where athlete_id in (${ids}));
      delete from public.workout_sessions where athlete_id in (${ids});
      delete from public.program_assignments where coach_id in (${ids}) or athlete_id in (${ids});
      delete from public.programs where owner_id in (${ids});
      delete from public.exercises where owner_id in (${ids});
      delete from public.coach_athletes where coach_id in (${ids}) or athlete_id in (${ids});
      delete from public.user_roles where user_id in (${ids});
      delete from public.profiles where id in (${ids});
      commit;`);
    for (const { id } of accounts) data(await admin.auth.admin.deleteUser(id));
    console.log('Removed only the local accounts and records created by this run.');
  }
}
