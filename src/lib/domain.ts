export type Role = 'athlete' | 'coach';
export type SessionStatus = 'scheduled' | 'in_progress' | 'finished' | 'skipped';
export type BlockKind =
  | 'single'
  | 'superset'
  | 'circuit'
  | 'emom'
  | 'amrap'
  | 'for_time'
  | 'warmup'
  | 'cooldown'
  | 'instruction';
export type Prescription = import('zod').infer<typeof import('./import').prescriptionSchema>;
export type Entry = {
  id: string;
  exerciseId: string | null;
  name: string;
  label: string;
  eligible: boolean;
  referenceUrl: string | null;
  prescription: Prescription;
  instructions: string;
  completed: boolean;
  load: string;
  notes: string;
};
export type Block = {
  id: string;
  label: string;
  kind: BlockKind;
  instructions: string;
  entries: Entry[];
};
export type WorkoutSession = {
  id: string;
  athleteId: string;
  deleted?: boolean;
  assignmentId: string | null;
  date: string;
  title: string;
  description?: string;
  category?: string;
  estimatedMinutes?: number | null;
  status: SessionStatus;
  finishedAt: string | null;
  version: number;
  blocks: Block[];
  updatedAt: string;
  position?: number;
  provenance?: {
    programId: string;
    name: string;
    description: string;
    version: number;
    schemaVersion: number;
  } | null;
};
export type SessionLog = {
  deleted?: boolean;
  status: SessionStatus;
  finishedAt: string | null;
  results: { entryId: string; completed: boolean; load: string; notes: string }[];
};
export function sessionLog(session: WorkoutSession): SessionLog {
  return {
    ...(session.deleted ? { deleted: true } : {}),
    status: session.status,
    finishedAt: session.finishedAt,
    results: session.blocks.flatMap((b) =>
      b.entries.map((e) => ({
        entryId: e.id,
        completed: e.completed,
        load: e.load,
        notes: e.notes,
      })),
    ),
  };
}
// Calendar, history and summaries share these session occurrences; never join templates into the calendar.
export function visibleSessions(sessions: WorkoutSession[]) {
  const unique = new Map<string, WorkoutSession>();
  for (const session of sessions) {
    const previous = unique.get(session.id);
    if (
      !previous ||
      session.version > previous.version ||
      (session.version === previous.version && session.deleted)
    )
      unique.set(session.id, session);
  }
  return [...unique.values()].filter((s) => !s.deleted);
}
export function completion(sessions: WorkoutSession[]) {
  const entries = visibleSessions(sessions)
    .flatMap((s) => s.blocks.flatMap((b) => b.entries))
    .filter((e) => e.eligible);
  const total = entries.length;
  const completed = entries.filter((e) => e.completed).length;
  return { total, completed, percent: total ? Math.round((completed / total) * 100) : null };
}
export function adherence(sessions: WorkoutSession[], today: string) {
  const due = visibleSessions(sessions).filter(
    (s) => s.date <= today && s.blocks.some((b) => b.entries.some((e) => e.eligible)),
  );
  const finished = due.filter((s) => s.status === 'finished').length;
  return {
    due: due.length,
    finished,
    percent: due.length ? Math.round((finished / due.length) * 100) : null,
  };
}
export function statusLabel(s: WorkoutSession, today: string) {
  if (s.status === 'finished')
    return completion([s]).percent === null
      ? 'Finished · rest / instructions'
      : completion([s]).percent === 100
        ? 'Finished'
        : 'Finished · partial';
  if (!s.blocks.some((b) => b.entries.some((e) => e.eligible))) return 'Rest / instructions';
  if (s.status === 'scheduled' && s.date < today) return 'Missed';
  return s.status.replace('_', ' ');
}
export function hasSessionHistory(session: WorkoutSession) {
  return (
    !session.deleted &&
    (session.status === 'finished' ||
      session.status === 'skipped' ||
      session.blocks.some((b) => b.entries.some(hasRecordedActivity)))
  );
}
export function hasRecordedActivity(e: Entry) {
  return e.eligible && (e.completed || !!e.load.trim() || !!e.notes.trim());
}
export function exerciseRecords(
  sessions: WorkoutSession[],
  athleteId: string,
  exerciseId: string | null,
) {
  if (!exerciseId) return [];
  return visibleSessions(sessions)
    .filter((s) => s.athleteId === athleteId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
    .flatMap((session) =>
      session.blocks
        .flatMap((b) => b.entries)
        .filter((entry) => entry.exerciseId === exerciseId && hasRecordedActivity(entry))
        .map((entry) => ({ session, entry })),
    );
}
export function exerciseHistory(sessions: WorkoutSession[], current: WorkoutSession, entry: Entry) {
  return exerciseRecords(sessions, current.athleteId, entry.exerciseId).filter(
    ({ session }) => session.id !== current.id && session.date <= current.date,
  );
}
export function todayInZone(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z'),
  );
}
export function safeUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
export function prescriptionText(p: Prescription): string {
  return [
    p.sets ? `${p.sets} sets` : null,
    p.reps ? `${p.reps} reps` : null,
    p.load,
    p.duration,
    p.distance,
    p.calories ? `${p.calories} cal` : null,
    p.rounds ? `${p.rounds} rounds` : null,
    p.tempo ? `Tempo ${p.tempo}` : null,
    p.rest ? `Rest ${p.rest}` : null,
    p.text,
    p.targetRpe !== undefined ? `Target RPE ${p.targetRpe}` : null,
    p.targetRir !== undefined ? `Target RIR ${p.targetRir}` : null,
    p.percentage ? `${p.percentage.value}% of ${p.percentage.reference}` : null,
    p.side?.replaceAll('_', ' '),
    p.pace ? `Pace ${p.pace}` : null,
    p.zone ? `Zone ${p.zone}` : null,
    p.progression ? `Progression: ${p.progression}` : null,
    p.stop ? `Stop: ${p.stop}` : null,
    p.alternatives ? `Alternatives: ${p.alternatives}` : null,
    p.setDetails?.map((s, i) => `Set ${i + 1} (${s.kind}): ${prescriptionText(s)}`).join(' · '),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function compareSessionOrder(a: WorkoutSession, b: WorkoutSession) {
  return (
    a.date.localeCompare(b.date) ||
    (a.assignmentId ?? '').localeCompare(b.assignmentId ?? '') ||
    (a.position ?? 0) - (b.position ?? 0) ||
    a.id.localeCompare(b.id)
  );
}
