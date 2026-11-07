import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProgram, programSchema } from '../src/lib/import';
const valid = readFileSync('docs/examples/foundation.json', 'utf8');
describe('program import', () => {
  it('accepts the documented example and preserves order/grouping', () => {
    const p = parseProgram(valid);
    expect(p.weeks[0].workouts).toHaveLength(3);
    expect(p.weeks[0].workouts[0].blocks[1].entries.map((e) => e.label)).toEqual(['B1', 'B2']);
    expect(p.weeks[0].workouts[0].blocks[1].entries[0].prescription.rest).toBe('90 seconds');
    // Preserve the serialized input used by existing server duplicate checksums.
    expect(p.weeks[0].workouts[0]).not.toHaveProperty('category');
    expect(p.weeks[0].workouts[0]).not.toHaveProperty('description');
  });
  it('reports actionable malformed JSON', () => {
    expect(() => parseProgram('{bad')).toThrow('Invalid JSON');
  });
  it('rejects invalid fixture with the offending path', () => {
    expect(() => parseProgram(readFileSync('tests/fixtures/invalid-program.json', 'utf8'))).toThrow(
      'weeks.0.workouts.0.day',
    );
  });
  it('rejects unsupported versions and unknown fields', () => {
    const data = JSON.parse(valid);
    expect(programSchema.safeParse({ ...data, schemaVersion: 2 }).success).toBe(false);
    expect(programSchema.safeParse({ ...data, secret: 'unexpected' }).success).toBe(false);
  });
  it('rejects duplicate weeks', () => {
    const data = JSON.parse(valid);
    data.weeks.push(data.weeks[0]);
    expect(programSchema.safeParse(data).success).toBe(false);
  });
  it('rejects ambiguous exercise identity and instruction-only counting', () => {
    const data = JSON.parse(valid);
    const block = data.weeks[0].workouts[0].blocks[1];
    block.entries[1].exerciseKey = block.entries[0].exerciseKey;
    expect(programSchema.safeParse(data).success).toBe(false);
    const p = JSON.parse(valid);
    p.weeks[0].workouts[0].blocks[0].kind = 'instruction';
    expect(programSchema.safeParse(p).success).toBe(false);
  });
  it('rejects unsafe links', () => {
    const data = JSON.parse(valid);
    data.weeks[0].workouts[0].blocks[0].entries[0].referenceUrl = 'javascript:alert(1)';
    expect(programSchema.safeParse(data).success).toBe(false);
  });
  it('round-trips optional workout details and validates duration and category', () => {
    const data = JSON.parse(valid);
    const workout = data.weeks[0].workouts[0];
    Object.assign(workout, {
      description: 'Train with control',
      category: 'Strength',
      estimatedMinutes: 45,
    });
    expect(parseProgram(JSON.stringify(data)).weeks[0].workouts[0]).toMatchObject({
      description: 'Train with control',
      category: 'Strength',
      estimatedMinutes: 45,
    });
    for (const minutes of [0, -1, 1441, 1.5, '45', null]) {
      workout.estimatedMinutes = minutes;
      expect(programSchema.safeParse(data).success).toBe(false);
    }
    workout.estimatedMinutes = 45;
    workout.category = 'x'.repeat(81);
    expect(programSchema.safeParse(data).success).toBe(false);
  });
});
