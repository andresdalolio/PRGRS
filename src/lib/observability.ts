type Context = 'application' | 'sync' | 'storage' | 'service-worker' | 'render' | 'api-auth';
const recent = new Map<string, number>();
export function reportError(context: Context, error: unknown) {
  // Deliberately exclude messages, stacks, URLs, IDs, tokens, notes and RPC payloads.
  const message = error instanceof Error ? error.message : String(error);
  const kind = /quota|storage|indexeddb/i.test(message)
    ? 'storage'
    : /VERSION_CONFLICT/.test(message)
      ? 'conflict'
      : /jwt|auth|sign in|session expired/i.test(message)
        ? 'authentication'
        : /fetch|network|timeout|timed out|abort/i.test(message)
          ? 'network'
          : /valid|parse|schema|acknowledgement/i.test(message)
            ? 'validation'
            : 'unknown';
  const key = `${context}:${kind}`;
  if (Date.now() - (recent.get(key) ?? 0) < 30_000) return;
  recent.set(key, Date.now());
  const event = { context, kind };
  console.error('[PRGRS]', event);
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('prgrs:error', { detail: event }));
}
