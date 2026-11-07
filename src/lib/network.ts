// Abort the actual request so a stalled connection cannot hold the foreground sync lock forever.
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const source = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    15_000,
  );
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Supabase responses are finite JSON, not streams. Keep the deadline active through
    // body delivery too; preserve the original Response (including URL/headers) for the SDK.
    if (response.body) await response.clone().arrayBuffer();
    return response;
  } finally {
    clearTimeout(timer);
    source?.removeEventListener('abort', abort);
  }
}
