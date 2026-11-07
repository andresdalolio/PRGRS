import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicConfiguration } from '../src/lib/config';
import { fetchWithTimeout } from '../src/lib/network';
import { reportError } from '../src/lib/observability';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('production configuration', () => {
  const key = 'sb_publishable_test_only';
  it('allows hosted HTTPS and loopback development with public keys', () => {
    expect(publicConfiguration('https://project.supabase.co', key).error).toBeNull();
    expect(publicConfiguration('http://127.0.0.1:54321', key).error).toBeNull();
    const token = ['test', btoa(JSON.stringify({ role: 'anon' })), 'test'].join('.');
    expect(publicConfiguration('https://project.supabase.co', token).error).toBeNull();
  });
  it('rejects missing, placeholder, malformed and privileged values without echoing them', () => {
    for (const [url, value] of [
      ['', ''],
      ['https://YOUR_PROJECT.supabase.co', key],
      ['http://project.supabase.co', key],
      ['https://user:password@project.supabase.co', key],
      ['https://project.supabase.co/path', key],
      ['https://project.supabase.co', 'sb_secret_do_not_expose'],
      [
        'https://project.supabase.co',
        ['test', btoa(JSON.stringify({ role: 'service_role' })), 'test'].join('.'),
      ],
    ]) {
      const result = publicConfiguration(url, value);
      expect(result.error).toBeTruthy();
      expect(result).not.toHaveProperty('key');
      expect(result).not.toHaveProperty('url');
    }
  });
});

describe('bounded network requests', () => {
  it('keeps the deadline active when headers arrive but the response body stalls', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init.signal.addEventListener('abort', () => controller.error(init.signal.reason));
              },
            }),
          ),
        ),
      ),
    );
    const result = expect(fetchWithTimeout('https://example.com')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts a stalled request and leaves the next request usable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
          }),
      ),
    );
    const pending = expect(fetchWithTimeout('https://example.com')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));
    expect(await (await fetchWithTimeout('https://example.com')).text()).toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init) => {
        expect(init.signal.aborted).toBe(true);
        return Promise.reject(init.signal.reason);
      }),
    );
    await expect(
      fetchWithTimeout('https://example.com', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

it('reports useful categories without recording private error content', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  reportError(
    'storage',
    new Error('IndexedDB quota exceeded with private training notes and token'),
  );
  expect(log).toHaveBeenCalledWith('[PRGRS]', { context: 'storage', kind: 'storage' });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|token|notes/);
});
