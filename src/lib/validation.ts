import { z } from 'zod';
import { prescriptionSchema } from './import';
import type { WorkoutSession } from './domain';
const entry = z.object({
  id: z.string().uuid(),
  exerciseId: z.string().uuid().nullable(),
  name: z.string().max(160),
  label: z.string(),
  eligible: z.boolean(),
  referenceUrl: z.string().nullable(),
  prescription: prescriptionSchema,
  instructions: z.string(),
  completed: z.boolean(),
  load: z.string().max(160),
  notes: z.string().max(4000),
});
export const sessionSchema: z.ZodType<WorkoutSession> = z.object({
  id: z.string().uuid(),
  athleteId: z.string().uuid(),
  assignmentId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string(),
  description: z.string().default(''),
  category: z.string().default(''),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  status: z.enum(['scheduled', 'in_progress', 'finished', 'skipped']),
  finishedAt: z.string().nullable(),
  version: z.number().int().min(0),
  updatedAt: z.string(),
  position: z.number().int().min(0).optional(),
  provenance: z
    .object({
      programId: z.string().uuid(),
      name: z.string(),
      description: z.string(),
      version: z.number().int().min(1),
      schemaVersion: z.number().int().min(1).max(2),
    })
    .nullable()
    .optional(),
  blocks: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string(),
      kind: z.enum([
        'single',
        'superset',
        'circuit',
        'emom',
        'amrap',
        'for_time',
        'warmup',
        'cooldown',
        'instruction',
      ]),
      instructions: z.string(),
      entries: z.array(entry),
    }),
  ),
});
export const sessionsSchema = z.array(sessionSchema);
