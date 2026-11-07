import { z } from 'zod';
const text = z.string().trim().max(2000);
const reference = z
  .string()
  .max(2000)
  .url()
  .refine((v) => ['https:', 'http:'].includes(new URL(v).protocol), 'Use an http or https URL');
const legacyPrescriptionSchema = z
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
const targetFields = {
  reps: text.optional(),
  load: text.optional(),
  duration: text.optional(),
  distance: text.optional(),
  calories: z.number().int().min(1).max(10000).optional(),
  tempo: text.optional(),
  rest: text.optional(),
  text: text.optional(),
  targetRpe: z.number().min(0).max(10).optional(),
  targetRir: z.number().min(0).max(100).optional(),
  percentage: z
    .object({ value: z.number().min(0).max(100), reference: z.string().trim().min(1).max(2000) })
    .strict()
    .optional(),
  side: z.enum(['per_side', 'alternating', 'total']).optional(),
  pace: text.optional(),
  zone: text.optional(),
};
export const prescriptionSchema = legacyPrescriptionSchema.extend({
  ...targetFields,
  progression: text.optional(),
  stop: text.optional(),
  alternatives: text.optional(),
  setDetails: z
    .array(z.object({ kind: z.enum(['warmup', 'work']), ...targetFields }).strict())
    .min(1)
    .max(100)
    .optional(),
});
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
const commonProgramSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
        for (const [bi, b] of d.blocks.entries()) {
          const path = [
            'weeks',
            p.weeks.indexOf(w),
            'workouts',
            w.workouts.indexOf(d),
            'blocks',
            bi,
          ];
          if (
            p.schemaVersion === 2 &&
            ['superset', 'circuit', 'emom', 'amrap', 'for_time'].includes(b.kind) &&
            !b.instructions.trim()
          )
            ctx.addIssue({
              code: 'custom',
              message: 'Describe the group rounds, timing and recovery protocol in instructions',
              path: [...path, 'instructions'],
            });
          for (const [ei, e] of b.entries.entries()) {
            if (e.prescription.sets !== undefined && e.prescription.setDetails !== undefined)
              ctx.addIssue({
                code: 'custom',
                message: 'Use sets or setDetails, never both',
                path: [...path, 'entries', ei, 'prescription'],
              });
            const identity = JSON.stringify([e.name, e.referenceUrl ?? null, e.aliases]);
            const previous = identities.get(e.exerciseKey);
            if (previous && previous !== identity)
              ctx.addIssue({
                code: 'custom',
                message: `Exercise key ${e.exerciseKey} has conflicting names, aliases or references`,
                path: [...path, 'entries', ei, 'exerciseKey'],
              });
            identities.set(e.exerciseKey, identity);
          }
        }
  });
const legacyProgramSchema = commonProgramSchema.safeExtend({
  schemaVersion: z.literal(1),
  weeks: z
    .array(
      z
        .object({
          week: z.number().int().min(1).max(52),
          workouts: z
            .array(
              workoutSchema.extend({
                blocks: z
                  .array(
                    blockSchema.safeExtend({
                      entries: z
                        .array(
                          entrySchema.extend({
                            prescription: legacyPrescriptionSchema.default({}),
                          }),
                        )
                        .max(50),
                    }),
                  )
                  .min(1)
                  .max(30),
              }),
            )
            .max(21),
        })
        .strict(),
    )
    .min(1)
    .max(52),
});
export const trainingProgramSchema = commonProgramSchema.safeExtend({
  schemaVersion: z.literal(2),
});
export type ProgramInput = z.infer<typeof commonProgramSchema>;
export const programSchema: z.ZodType<ProgramInput> = z.union([
  legacyProgramSchema,
  trainingProgramSchema,
]);
export function parseProgram(raw: string) {
  if (new TextEncoder().encode(raw).length > 2_000_000)
    throw new Error('Keep JSON files below 2 MB.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON. Check commas, quotes, and brackets.');
  }
  if (
    !json ||
    typeof json !== 'object' ||
    !('schemaVersion' in json) ||
    (json.schemaVersion !== 1 && json.schemaVersion !== 2)
  )
    throw new Error('schemaVersion: Supported versions are 1 and 2.');
  const result = (json.schemaVersion === 2 ? trainingProgramSchema : legacyProgramSchema).safeParse(
    json,
  );
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

export type ExerciseMetadata = {
  exercise_key: string;
  name: string;
  aliases: string[];
  reference_url: string | null;
};
export function resolveProgramExercises(program: ProgramInput, library: ExerciseMetadata[]) {
  const resolved = structuredClone(program);
  const conflicts = new Set<string>();
  const byKey = new Map(library.map((e) => [e.exercise_key, e]));
  for (const w of resolved.weeks)
    for (const d of w.workouts)
      for (const b of d.blocks)
        for (const e of b.entries) {
          const canonical = byKey.get(e.exerciseKey);
          if (!canonical) continue;
          if (
            JSON.stringify([e.name, e.referenceUrl ?? null, e.aliases]) !==
            JSON.stringify([canonical.name, canonical.reference_url, canonical.aliases])
          )
            conflicts.add(e.exerciseKey);
          e.name = canonical.name;
          e.aliases = [...canonical.aliases];
          if (canonical.reference_url) e.referenceUrl = canonical.reference_url;
          else delete e.referenceUrl;
        }
  return { program: resolved, conflicts: [...conflicts] };
}
