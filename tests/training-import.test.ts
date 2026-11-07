import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  parseProgram,
  programSchema,
  trainingProgramSchema,
  resolveProgramExercises,
} from '../src/lib/import';
import { prescriptionText, compareSessionOrder, completion } from '../src/lib/domain';
import { sessionSchema } from '../src/lib/validation';
import type { WorkoutSession } from '../src/lib/domain';
const raw = readFileSync('docs/integration/trainer-example.json', 'utf8');
const input = () => JSON.parse(raw);
const target = (p: ReturnType<typeof input>) => p.weeks[0].workouts[0].blocks[1].entries[0];
describe('Trainer delivery v2', () => {
  it('reports supported versions explicitly', () => {
    expect(() => parseProgram(JSON.stringify({ ...input(), schemaVersion: 99 }))).toThrow(
      'schemaVersion: Supported versions are 1 and 2',
    );
  });
  it('preserves set targets, protocol, effort, reference and rules without inventing loads', () => {
    const p = parseProgram(raw);
    expect(target(p).prescription).toEqual(target(input()).prescription);
    const text = prescriptionText(target(p).prescription);
    for (const expected of [
      'Set 1 (warmup)',
      'Set 3 (work)',
      'Target RPE 8',
      '70% of tested 1RM',
      'Stop:',
      'Alternatives:',
      'Progression:',
      'Calibrate; no invented kg',
    ])
      expect(text).toContain(expected);
    expect(p.weeks[0].workouts[0].blocks[2].instructions).toContain('90 sec after each round');
  });
  it.each([
    [
      'missing denominator',
      (p: ReturnType<typeof input>) => {
        delete target(p).prescription.percentage.reference;
      },
      'percentage.reference',
    ],
    [
      'target bound',
      (p: ReturnType<typeof input>) => {
        target(p).prescription.targetRpe = 11;
      },
      'targetRpe',
    ],
    [
      'unknown actuals',
      (p: ReturnType<typeof input>) => {
        target(p).prescription.setDetails[0].actualReps = 5;
      },
      'setDetails.0',
    ],
    [
      'ambiguous set count',
      (p: ReturnType<typeof input>) => {
        target(p).prescription.sets = 3;
      },
      'prescription',
    ],
    [
      'missing protocol',
      (p: ReturnType<typeof input>) => {
        p.weeks[0].workouts[0].blocks[2].instructions = '';
      },
      'instructions',
    ],
    [
      'unsafe URL',
      (p: ReturnType<typeof input>) => {
        target(p).referenceUrl = 'data:text/html,bad';
      },
      'referenceUrl',
    ],
    [
      'version downgrade',
      (p: ReturnType<typeof input>) => {
        p.schemaVersion = 1;
      },
      'prescription',
    ],
  ])('rejects %s with a useful path', (_, mutate, path) => {
    const p = input();
    mutate(p);
    expect(() => parseProgram(JSON.stringify(p))).toThrow(path);
  });
  it('exposes canonical differences and uses exactly the previewed library metadata', () => {
    const p = parseProgram(raw);
    const library = [
      {
        exercise_key: target(p).exerciseKey,
        name: 'Canonical bench',
        aliases: ['Bench'],
        reference_url: null,
      },
    ];
    const resolved = resolveProgramExercises(p, library);
    expect(resolved.conflicts).toEqual([target(p).exerciseKey]);
    expect(target(resolved.program).name).toBe('Canonical bench');
    expect(target(resolved.program).referenceUrl).toBeUndefined();
    expect(target(p).name).toBe('Paused barbell bench press');
    expect(programSchema.safeParse(resolved.program).success).toBe(true);
  });
  it('keeps published schemas and embedded server structural validation aligned', () => {
    const published = JSON.parse(
      readFileSync('docs/integration/PRGRS_TRAINING_SCHEMA.json', 'utf8'),
    );
    expect(published).toEqual(
      z.toJSONSchema(trainingProgramSchema, { target: 'draft-2020-12', io: 'input' }),
    );
    const both = JSON.parse(readFileSync('public/examples/program.schema.json', 'utf8'));
    const migration = readFileSync(
      'supabase/migrations/20261107231502_training_contract.sql',
      'utf8',
    );
    for (const [i, delimiter] of ['v1', 'v2'].entries()) {
      const embedded = migration.split(`$${delimiter}$`)[1];
      expect(JSON.parse(embedded)).toEqual(both.anyOf[i]);
    }
  });
  it('retains rich snapshots through session parsing with one completion unit per occurrence', () => {
    const e = target(parseProgram(raw));
    const id = '11111111-1111-4111-8111-111111111111';
    const s: WorkoutSession = {
      id,
      athleteId: id,
      assignmentId: id,
      date: '2026-11-02',
      title: 'Training',
      status: 'finished',
      finishedAt: '2026-11-02T20:00:00Z',
      updatedAt: '2026-11-02T20:00:00Z',
      version: 1,
      position: 1,
      provenance: {
        programId: id,
        name: 'Trainer',
        description: 'Objectives',
        version: 1,
        schemaVersion: 2,
      },
      blocks: [
        {
          id,
          label: 'A',
          kind: 'single',
          instructions: '',
          entries: [
            {
              ...e,
              id,
              exerciseId: id,
              completed: false,
              load: '20 kg',
              notes: 'Actual',
              referenceUrl: e.referenceUrl ?? null,
            },
          ],
        },
      ],
    };
    const parsed = sessionSchema.parse(s);
    expect(parsed.blocks[0].entries[0].prescription).toEqual(e.prescription);
    expect(parsed.provenance).toEqual(s.provenance);
    expect(completion([parsed])).toEqual({ total: 1, completed: 0, percent: 0 });
    expect(compareSessionOrder({ ...s, position: 0 }, s)).toBeLessThan(0);
  });
});
