import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { configuration } from './config';
import { fetchWithTimeout } from './network';
let client: SupabaseClient<Database> | null = null;
export function configured() {
  return !configuration().error;
}
export function supabase() {
  const config = configuration();
  if (config.error) throw new Error(config.error);
  if (!client)
    client = createClient<Database>(config.url!, config.key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: fetchWithTimeout },
    });
  return client;
}
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
export async function signOutDevice() {
  const { error } = await supabase().auth.signOut({ scope: 'local' });
  if (error) {
    // The SDK removes local credentials before attempting network revocation.
    // Only fail device logout if credentials actually remain on this device.
    const current = await supabase().auth.getSession();
    if (current.error || current.data.session) throw error;
  }
}
