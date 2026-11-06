// Test infrastructure only. The production app never imports PGlite or this auth shim.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export async function createTestDatabase() {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(file, directory), 'utf8'));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
