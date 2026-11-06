import type { WorkoutSession } from '../../src/lib/domain';
export function fixture(count = 10, checked = 0, date = '2026-11-06'): WorkoutSession {
  return {
    id: crypto.randomUUID(),
    athleteId: 'athlete',
    assignmentId: 'assignment',
    date,
    title: 'Training',
    status: 'scheduled',
    finishedAt: null,
    version: 0,
    updatedAt: new Date().toISOString(),
    blocks: [
      {
        id: 'block',
        label: 'A',
        kind: 'circuit',
        instructions: '',
        entries: Array.from({ length: count }, (_, i) => ({
          id: `entry-${i}`,
          exerciseId: `exercise-${i}`,
          name: `Exercise ${i}`,
          label: `A${i + 1}`,
          eligible: true,
          referenceUrl: null,
          prescription: { reps: '10' },
          instructions: '',
          completed: i < checked,
          load: '',
          notes: '',
        })),
      },
    ],
  };
}
