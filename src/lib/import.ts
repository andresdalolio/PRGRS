import { z } from 'zod';
const text = z.string().trim().max(2000);
const reference = z
  .string()
  .max(2000)
  .url()
  .refine((v) => ['https:', 'http:'].includes(new URL(v).protocol), 'Use an http or https URL');
export const prescriptionSchema = z
  .object({
    sets: z.number().int().min(1).max(100).optional(),
    reps: text.optional(),
    load: text.optional(),
    duration: text.optional(),
    distance: text.optional(),
    calories: z.number().int().min(1).max(10000).optional(),
    rounds: z.number().int().min(1).max(1000).optional(),
    tempo: text.optional(),
    rest: text.optional(),
    text: text.optional(),
  })
  .strict();
export const entrySchema = z
  .object({
    exerciseKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    name: z.string().trim().min(1).max(160),
    label: z.string().max(12),
    eligible: z.boolean().default(true),
    referenceUrl: reference.optional(),
    aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    prescription: prescriptionSchema.default({}),
    instructions: text.default(''),
  })
  .strict();
export const blockSchema = z
  .object({
    label: z.string().max(12),
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
    instructions: text.default(''),
    entries: z.array(entrySchema).max(50),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.kind === 'instruction' && b.entries.some((e) => e.eligible))
      ctx.addIssue({
        code: 'custom',
        message: 'Instruction-only blocks cannot contain eligible exercises',
        path: ['entries'],
      });
  });
export const workoutSchema = z
  .object({
    day: z.number().int().min(1).max(7),
    title: z.string().trim().min(1).max(160),
    description: text.optional(),
    category: z.string().trim().max(80).optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).optional(),
    blocks: z.array(blockSchema).min(1).max(30),
  })
  .strict();
export const programSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(160),
    description: text.default(''),
    weeks: z
      .array(
        z
          .object({
            week: z.number().int().min(1).max(52),
            workouts: z.array(workoutSchema).max(21),
          })
          .strict(),
      )
      .min(1)
      .max(52),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (new Set(p.weeks.map((w) => w.week)).size !== p.weeks.length)
      ctx.addIssue({ code: 'custom', message: 'Week numbers must be unique', path: ['weeks'] });
    const identities = new Map<string, string>();
    for (const w of p.weeks)
      for (const d of w.workouts)
        for (const b of d.blocks)
          for (const e of b.entries) {
            const previous = identities.get(e.exerciseKey);
            if (previous && previous !== e.name)
              ctx.addIssue({
                code: 'custom',
                message: `Exercise key ${e.exerciseKey} has conflicting names`,
              });
            identities.set(e.exerciseKey, e.name);
          }
  });
export type ProgramInput = z.infer<typeof programSchema>;
export function parseProgram(raw: string) {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON. Check commas, quotes, and brackets.');
  }
  const result = programSchema.safeParse(json);
  if (!result.success)
    throw new Error(
      result.error.issues.map((i) => `${i.path.join('.') || 'program'}: ${i.message}`).join('\n'),
    );
  return result.data;
}
export function blankProgram(): ProgramInput {
  return {
    schemaVersion: 1,
    name: 'Untitled program',
    description: '',
    weeks: [
      {
        week: 1,
        workouts: [
          {
            day: 1,
            title: 'Full body',
            description: '',
            category: '',
            blocks: [
              {
                label: 'A',
                kind: 'single',
                instructions: '',
                entries: [
                  {
                    exerciseKey: 'goblet-squat',
                    name: 'Goblet squat',
                    label: 'A',
                    eligible: true,
                    aliases: [],
                    prescription: { sets: 3, reps: '8–10', rest: '90 seconds' },
                    instructions: '',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
