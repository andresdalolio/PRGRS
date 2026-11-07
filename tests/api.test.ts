import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/me/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function configure() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_only');
}
function request(header?: string) {
  return new Request('https://app.example/api/me', {
    headers: header ? { authorization: header } : {},
  });
}
it('returns understandable configuration and bearer errors without caching either', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  const missing = await GET(request());
  expect(missing.status).toBe(503);
  expect(missing.headers.get('cache-control')).toBe('no-store');
  configure();
  for (const header of [undefined, 'Basic token', 'Bearer token extra', 'Bearer ']) {
    const denied = await GET(request(header));
    expect(denied.status).toBe(401);
    expect(denied.headers.get('cache-control')).toBe('no-store');
  }
});
it('validates the bearer with Auth before returning roles and never caches identity', async () => {
  configure();
  const fetcher = vi.fn().mockImplementation(async (input: string) => {
    return Response.json(
      input.includes('/auth/v1/user')
        ? { id: 'test-user', app_metadata: {}, user_metadata: {} }
        : [{ role: 'athlete' }, { role: 'coach' }],
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const response = await GET(request('Bearer test-token'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: 'test-user', roles: ['athlete', 'coach'] });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
});
it('rejects revoked credentials and sanitizes database errors', async () => {
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ message: 'Invalid JWT' }, { status: 401 })),
  );
  expect((await GET(request('Bearer revoked-token'))).status).toBe(401);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async (input: string) =>
        input.includes('/auth/v1/user')
          ? Response.json({ id: 'test-user', app_metadata: {}, user_metadata: {} })
          : Response.json({ message: 'private database details', code: '42501' }, { status: 403 }),
      ),
  );
  const failed = await GET(request('Bearer test-token'));
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('private');
  expect(failed.headers.get('cache-control')).toBe('no-store');
});
