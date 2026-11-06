import { describe, it, expect } from 'vitest';
import {
  adherence,
  completion,
  statusLabel,
  todayInZone,
  shiftDate,
  weekStart,
  safeUrl,
} from '../src/lib/domain';
import { fixture } from './fixtures/session';
describe('training invariants', () => {
  it('finishing 9/10 stays 90%', () => {
    const s = fixture(10, 9);
    s.status = 'finished';
    s.finishedAt = new Date().toISOString();
    expect(completion([s])).toEqual({ total: 10, completed: 9, percent: 90 });
    expect(statusLabel(s, '2026-11-06')).toBe('Finished · partial');
  });
  it('aggregates numerators rather than averaging percentages', () => {
    expect(completion([fixture(1, 1), fixture(9, 0)]).percent).toBe(10);
  });
  it('excludes instruction-only and rest entries', () => {
    const s = fixture(2, 1);
    s.blocks[0].entries[1].eligible = false;
    expect(completion([s]).percent).toBe(100);
    expect(completion([]).percent).toBeNull();
  });
  it('adherence counts skipped and in-progress due sessions but not future or rest', () => {
    const finished = fixture(10, 9);
    finished.status = 'finished';
    const skipped = fixture();
    skipped.status = 'skipped';
    const active = fixture();
    active.status = 'in_progress';
    expect(
      adherence(
        [finished, skipped, active, fixture(10, 0, '2026-11-07'), fixture(0)],
        '2026-11-06',
      ),
    ).toEqual({ due: 3, finished: 1, percent: 33 });
    expect(adherence([], '2026-11-06').percent).toBeNull();
  });
  it('future workouts never display missed', () => {
    expect(statusLabel(fixture(10, 0, '2026-11-07'), '2026-11-06')).toBe('scheduled');
    expect(statusLabel(fixture(10, 0, '2026-11-05'), '2026-11-06')).toBe('Missed');
  });
  it('uses the athlete timezone across midnight', () => {
    const now = new Date('2026-11-07T02:00:00Z');
    expect(todayInZone('America/Costa_Rica', now)).toBe('2026-11-06');
    expect(todayInZone('Asia/Tokyo', now)).toBe('2026-11-07');
  });
  it('handles calendar boundaries', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('allows YouTube and TikTok, rejects script and malformed URLs', () => {
    expect(safeUrl('https://www.tiktok.com/@coach/video/123')).toBeTruthy();
    expect(safeUrl('https://youtu.be/abc')).toBeTruthy();
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('no link')).toBeNull();
  });
});
