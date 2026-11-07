export function publicConfiguration(url = '', key = '') {
  const missing = !url || !key || /YOUR_PROJECT|YOUR_PUBLIC/.test(url + key);
  if (missing)
    return { error: 'Set the Supabase project URL and public publishable key before connecting.' };
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      throw new Error();
  } catch {
    return { error: 'Use an HTTPS Supabase project origin (HTTP is allowed only on loopback).' };
  }
  // Legacy anon JWTs are public keys; privileged JWTs must never enter a client build.
  let anon = false;
  try {
    anon =
      JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).role === 'anon';
  } catch {}
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anon)
    return {
      error:
        'Use a public publishable or legacy anon key. Secret and service-role keys are forbidden.',
    };
  return { url, key, error: null };
}

export function configuration() {
  return publicConfiguration(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
