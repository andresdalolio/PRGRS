/* Public shell only. Auth responses and Supabase requests are NEVER cached here. */
// Registration includes a build ID so every release gets a separate, complete offline shell.
const SHELL = `prgrs-shell-v3-${new URL(self.location.href).searchParams.get('build') || 'local'}`;
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/icons/favicon-32.png',
  '/icons/favicon-48.png',
  '/icons/favicon-64.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(CORE);
      const html = await (await cache.match('/')).text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1].replaceAll('&amp;', '&'))
        .filter((path) => path.startsWith('/_next/static/'));
      await cache.addAll([...new Set(assets)]);
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('prgrs-shell-') && key !== SHELL)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
// Wait for existing windows to close; never replace a worker during an active workout.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(event.request, { signal: controller.signal });
          if (response.status >= 500) throw new Error('Shell unavailable');
          if (response.body) await response.clone().arrayBuffer();
          // Keep the precached HTML paired with its precached assets. A future release's
          // network HTML must not overwrite the fallback while its worker is waiting.
          return response;
        } catch {
          return (await (await caches.open(SHELL)).match('/')) || Response.error();
        } finally {
          clearTimeout(timer);
        }
      })(),
    );
  } else if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/examples/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches
        .open(SHELL)
        .then((cache) => cache.match(event.request))
        .then(
          (cached) =>
            cached ||
            fetch(event.request).then((response) => {
              if (response.ok) {
                const copy = response.clone();
                event.waitUntil(caches.open(SHELL).then((cache) => cache.put(event.request, copy)));
              }
              return response;
            }),
        ),
    );
  }
});
