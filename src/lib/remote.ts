import { supabase, unwrap } from './supabase';
import type { WorkoutSession } from './domain';
import { sessionsSchema } from './validation';
import type { Mutation } from './db';
export async function fetchSessions(): Promise<WorkoutSession[]> {
  return sessionsSchema.parse(unwrap(await supabase().rpc('get_my_sessions')));
}
export async function sendMutation(m: Mutation) {
  const version = unwrap(
    await supabase().rpc('apply_session_mutation', {
      p_id: m.id,
      p_session: m.sessionId,
      p_base_version: m.baseVersion,
      p_log: m.log,
    }),
  );
  if (version !== m.baseVersion + 1)
    throw new Error('Invalid server acknowledgement. Your local edits are preserved for retry.');
}
