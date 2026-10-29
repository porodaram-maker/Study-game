import { describe, expect, it } from 'vitest';
import { daysUntil, flameFor, levelProgress } from '@/lib/game/level';

describe('levelProgress', () => {
  it('SQL level_for_xp와 같은 경계', () => {
    expect(levelProgress(0, 100, 50)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelProgress(99, 100, 50).level).toBe(1);
    expect(levelProgress(100, 100, 50)).toEqual({ level: 2, into: 0, need: 150 });
    expect(levelProgress(249, 100, 50)).toEqual({ level: 2, into: 149, need: 150 });
    expect(levelProgress(250, 100, 50)).toEqual({ level: 3, into: 0, need: 200 });
  });
});

describe('flameFor', () => {
  it('14.3 단계', () => {
    expect([0, 1, 6, 7, 29, 30, 99, 100].map(flameFor)).toEqual(['none', 'flame_s', 'flame_s', 'flame_m', 'flame_m', 'flame_l', 'flame_l', 'flame_blue']);
  });
});

describe('daysUntil', () => {
  it('날짜 차이', () => {
    expect(daysUntil('2026-11-05', '2026-10-29')).toBe(7);
    expect(daysUntil('2026-10-29', '2026-10-29')).toBe(0);
    expect(daysUntil('2026-10-28', '2026-10-29')).toBe(-1);
  });
});
