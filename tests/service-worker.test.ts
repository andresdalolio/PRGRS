import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

async function worker(build: string) {
  type WorkerEvent = {
    request?: object;
    waitUntil: (p: Promise<unknown>) => void;
    respondWith: (p: Promise<Response>) => void;
  };
  const handlers: Record<string, (e: WorkerEvent) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetcher = vi.fn().mockResolvedValue(new Response('network'));
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name)!;
    return {
      match: async (key: string | { url: string }) =>
        entries.get(typeof key === 'string' ? key : key.url)?.clone(),
      put: async (key: string | { url: string }, value: Response) => {
        entries.set(typeof key === 'string' ? key : key.url, value.clone());
      },
      addAll: async (paths: string[]) => {
        for (const path of paths) {
          const response = await fetcher(path);
          if (!response.ok) throw new Error('Asset unavailable');
          entries.set(path, response.clone());
        }
      },
    };
  };
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { href: `https://app.example/sw.js?build=${build}`, origin: 'https://app.example' },
      addEventListener: (name: string, handler: (e: WorkerEvent) => void) => {
        handlers[name] = handler;
      },
      clients: { claim: vi.fn() },
    },
    caches: {
      open: async (name: string) => cache(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: fetcher,
    URL,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  const request = async (
    path: string,
    options: { mode?: string; headers?: Record<string, string> } = {},
  ) => {
    let result: Promise<Response> | undefined;
    handlers.fetch({
      request: {
        url: `https://app.example${path}`,
        method: 'GET',
        mode: options.mode || 'cors',
        headers: new Headers(options.headers),
      },
      respondWith: (value) => {
        result = value;
      },
      waitUntil: () => {},
    });
    return result;
  };
  return {
    stores,
    fetcher,
    request,
    async install() {
      let result: Promise<unknown> | undefined;
      handlers.install({
        waitUntil: (value) => {
          result = value;
        },
        respondWith: () => {},
      });
      await result;
    },
  };
}

it('keeps installed HTML and assets together when a newer network shell is seen', async () => {
  const w = await worker('release-a');
  w.fetcher.mockImplementation(
    async (path: string) =>
      new Response(path === '/' ? '<script src="/_next/static/old.js"></script>' : 'old asset'),
  );
  await w.install();
  expect(w.stores.get('prgrs-shell-v3-release-a')?.has('/_next/static/old.js')).toBe(true);
  w.fetcher.mockResolvedValue(new Response('<script src="/_next/static/new.js"></script>'));
  expect(await (await w.request('/', { mode: 'navigate' }))?.text()).toContain('new.js');
  w.fetcher.mockRejectedValue(new Error('Offline'));
  expect(await (await w.request('/', { mode: 'navigate' }))?.text()).toContain('old.js');
  const next = await worker('release-b');
  await next.install();
  expect(next.stores.has('prgrs-shell-v3-release-b')).toBe(true);
});

it('falls back on server outages and never intercepts API or RSC responses', async () => {
  const w = await worker('release-a');
  w.fetcher.mockResolvedValue(new Response('installed shell'));
  await w.install();
  w.fetcher.mockResolvedValue(new Response('Unavailable', { status: 503 }));
  expect(await (await w.request('/', { mode: 'navigate' }))?.text()).toBe('installed shell');
  expect(await w.request('/api/me')).toBeUndefined();
  expect(await w.request('/?_rsc=private')).toBeUndefined();
  expect(await w.request('/', { headers: { RSC: '1' } })).toBeUndefined();
});

it('fails installation if an essential chunk cannot be cached', async () => {
  const w = await worker('broken-release');
  w.fetcher.mockImplementation(async (path: string) =>
    path.includes('missing.js')
      ? new Response('', { status: 404 })
      : new Response('<script src="/_next/static/missing.js"></script>'),
  );
  await expect(w.install()).rejects.toThrow('Asset unavailable');
});

it('opens the installed shell after a stalled navigation times out', async () => {
  vi.useFakeTimers();
  try {
    const w = await worker('slow-network');
    w.fetcher.mockResolvedValue(new Response('installed shell'));
    await w.install();
    w.fetcher.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const response = w.request('/', { mode: 'navigate' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await (await response)?.text()).toBe('installed shell');
  } finally {
    vi.useRealTimers();
  }
});
