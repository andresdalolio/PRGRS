import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { configuration } from '@/lib/config';
import { fetchWithTimeout } from '@/lib/network';
import { reportError } from '@/lib/observability';
export async function GET(request: Request) {
  const respond = (error: string, status: number) =>
    Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  const config = configuration();
  if (config.error) return respond('Supabase is not configured', 503);
  const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return respond('Authentication required', 401);
  try {
    const client = createClient<Database>(config.url!, config.key!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout, headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error || !user) {
      if (error?.name === 'AuthRetryableFetchError' || (error?.status && error.status >= 500)) {
        reportError('api-auth', error);
        return respond('Authentication temporarily unavailable', 503);
      }
      return respond('Invalid session', 401);
    }
    const { data, error: roleError } = await client
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    if (roleError) {
      reportError('api-auth', roleError);
      return respond('Unable to load account capabilities', 503);
    }
    return Response.json(
      { id: user.id, roles: data?.map((r) => r.role) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    reportError('api-auth', error);
    return respond('Authentication temporarily unavailable', 503);
  }
}
