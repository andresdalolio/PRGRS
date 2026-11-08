/* Test-only Supabase HTTP adapter backed by actual PostgreSQL migrations and RLS.
   Production never imports this module. Auth email/token delivery is simulated. */
import { createTestDatabase } from '../../scripts/test-database.mjs';
import { createServer } from 'node:http';
export const userId = '11111111-1111-4111-8111-111111111111';
export async function backend() {
  const db = await createTestDatabase();
  await db.query(
    `insert into auth.users(id,raw_user_meta_data) values($1,'{"name":"Alex Rivera"}')`,
    [userId],
  );
  await db.query("insert into public.user_roles(user_id,role) values($1,'coach')", [userId]);
  await db.query("update public.profiles set timezone='America/Costa_Rica' where id=$1", [userId]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec('set role authenticated');
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'alex@example.com',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'Alex Rivera' },
    identities: [],
    created_at: '2026-11-01T00:00:00Z',
  };
  const jwt = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const token = [
    jwt({ alg: 'HS256', typ: 'JWT' }),
    jwt({
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
    'test-signature',
  ].join('.');
  let online = true;
  let sessionReadError: string | null = null;
  const httpServer = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const incomingRequest = {
      url: () => `http://127.0.0.1:54331${incoming.url}`,
      method: () => incoming.method || 'GET',
      headers: () => incoming.headers,
      postDataJSON: () => (raw ? JSON.parse(raw) : null),
    };
    const route = {
      request: () => incomingRequest,
      abort: async () => {
        response.destroy();
      },
      fulfill: async ({
        status = 200,
        json,
        headers,
      }: {
        status?: number;
        json?: unknown;
        headers: Record<string, string>;
      }) => {
        response.writeHead(status, headers);
        response.end(json === undefined ? undefined : JSON.stringify(json));
      },
    };

    if (!online) {
      await route.abort();
      return;
    }
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers':
        'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept, accept-profile, content-profile',
      'access-control-allow-methods': '*',
      'content-type': 'application/json',
    };
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    try {
      if (path === '/auth/v1/token') {
        await route.fulfill({
          json: {
            access_token: token,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: 'test-refresh',
            user,
          },
          headers,
        });
        return;
      }
      if (path === '/auth/v1/user') {
        await route.fulfill({ json: user, headers });
        return;
      }
      if (path === '/auth/v1/logout') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (!request.headers().authorization?.includes(token)) {
        await route.fulfill({ status: 401, json: { message: 'Authentication required' }, headers });
        return;
      }
      let data: unknown;
      if (path.startsWith('/rest/v1/rpc/')) {
        const name = path.split('/').pop(),
          args = request.postDataJSON() || {};
        if (name === 'get_my_sessions' && sessionReadError) throw new Error(sessionReadError);
        if (name === 'get_my_sessions')
          data = (await db.query<{ result: unknown }>('select public.get_my_sessions() as result'))
            .rows[0].result;
        else if (name === 'get_program')
          data = (
            await db.query<{ result: unknown }>('select public.get_program($1) as result', [
              args.p_id,
            ])
          ).rows[0].result;
        else if (name === 'save_program')
          data = (
            await db.query<{ result: unknown }>(
              'select public.save_program($1::jsonb,$2) as result',
              [JSON.stringify(args.p_program), args.p_replace || null],
            )
          ).rows[0].result;
        else if (name === 'remove_program')
          data = (
            await db.query<{ result: unknown }>('select public.remove_program($1) as result', [
              args.p_program,
            ])
          ).rows[0].result;
        else if (name === 'assign_program')
          data = (
            await db.query<{ result: unknown }>(
              'select public.assign_program($1,$2,$3) as result',
              [args.p_program, args.p_athlete, args.p_start],
            )
          ).rows[0].result;
        else if (name === 'apply_feedback_mutation')
          data = (
            await db.query<{ result: unknown }>(
              'select public.apply_feedback_mutation($1,$2,$3,$4::jsonb) as result',
              [args.p_id, args.p_item, args.p_base_version, JSON.stringify(args.p_value)],
            )
          ).rows[0].result;
        else if (name === 'apply_session_mutation')
          data = (
            await db.query<{ result: unknown }>(
              'select public.apply_session_mutation($1,$2,$3,$4::jsonb) as result',
              [args.p_id, args.p_session, args.p_base_version, JSON.stringify(args.p_log)],
            )
          ).rows[0].result;
        else throw new Error('Unsupported test RPC ' + name);
      } else {
        const table = path.split('/').pop();
        if (method === 'GET') {
          if (table === 'profiles')
            data = (await db.query('select * from public.profiles where id=$1', [userId])).rows;
          else if (table === 'user_roles')
            data = (await db.query('select role from public.user_roles')).rows;
          else if (table === 'programs')
            data = (await db.query('select * from public.programs order by created_at desc')).rows;
          else if (table === 'feedback_items')
            data = (await db.query('select * from public.feedback_items')).rows;
          else if (table === 'exercises')
            data = (await db.query('select * from public.exercises order by name')).rows;
          else if (table === 'coach_athletes') data = [];
          else throw new Error('Unsupported test table ' + table);
          if (request.headers().accept?.includes('vnd.pgrst.object')) data = (data as unknown[])[0];
        } else if (method === 'PATCH' && table === 'profiles') {
          const body = request.postDataJSON();
          await db.query('update public.profiles set name=$1,timezone=$2 where id=$3', [
            body.name,
            body.timezone,
            userId,
          ]);
          data = null;
        } else throw new Error('Unsupported test write ' + table);
      }
      await route.fulfill({ status: 200, json: data, headers });
    } catch (error) {
      await route.fulfill({
        status: 400,
        json: { message: error instanceof Error ? error.message : String(error), code: 'TEST_DB' },
        headers,
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(54331, '127.0.0.1', resolve);
  });
  return {
    db,
    setOnline(value: boolean) {
      online = value;
    },
    setSessionReadError(value: string | null) {
      sessionReadError = value;
    },
    async close() {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
      await db.close();
    },
  };
}
