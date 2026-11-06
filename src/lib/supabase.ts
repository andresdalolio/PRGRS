import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
let client: SupabaseClient<Database> | null = null;
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('YOUR_PROJECT'),
  );
}
export function supabase() {
  if (!configured())
    throw new Error('Connect Supabase first. See docs/SETUP_AND_CONFIGURATION.md.');
  if (!client)
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
    );
  return client;
}
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
