import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: 'Supabase is not configured' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) return Response.json({ error: 'Invalid session' }, { status: 401 });
  const { data, error: roleError } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  if (roleError) return Response.json({ error: roleError.message }, { status: 500 });
  return Response.json(
    { id: user.id, roles: data?.map((r) => r.role) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
