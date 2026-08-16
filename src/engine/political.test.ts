import { describe, expect, it } from 'vitest';
import { loadJordan } from '@/data/fixtures/jordan';
import { contextFromState } from './testUtils';
import { classifyLean, politicalExposure } from './political';
import { round1 } from './normalize';
import { scoreOverall } from './score';

describe('political exposure', () => {
  it('classifyLean per §6.4 thresholds and unknown cases', () => {
    const p = { configured: true, direction: 1 as const, intensity: 1 };
    expect(classifyLean(2, p)).toBe('aligned');
    expect(classifyLean(1, p)).toBe('aligned');
    expect(classifyLean(0.5, p)).toBe('mixed');
    expect(classifyLean(0, p)).toBe('mixed');
    expect(classifyLean(-0.99, p)).toBe('mixed');
    expect(classifyLean(-1, p)).toBe('opposed');
    expect(classifyLean(-2, p)).toBe('opposed');
    expect(classifyLean(null, p)).toBe('unknown');
    expect(classifyLean(NaN, p)).toBe('unknown');
    expect(classifyLean(2, { configured: false, direction: 0, intensity: 0 })).toBe('unknown');
    expect(classifyLean(2, { configured: true, direction: 0, intensity: 1 })).toBe('unknown');
    // direction flips
    expect(classifyLean(2, { ...p, direction: -1 })).toBe('opposed');
  });

  it('Jordan: shares sum to 100, Unknown is first-class, contributors carry parent roll-up', () => {
    const state = loadJordan();
    const ctx = contextFromState(state);
    const cur = politicalExposure(state.categories, 'current', ctx);
    expect(cur.configured).toBe(true);
    const sum = cur.shares.aligned + cur.shares.mixed + cur.shares.opposed + cur.shares.unknown;
    expect(round1(sum)).toBe(100);
    expect(cur.shares.unknown).toBeGreaterThan(0);
    expect(cur.unassessedShare).toBe(cur.shares.unknown);
    const nm = cur.contributors.find((c) => c.companyId === 'nationalmart');
    expect(nm?.parentName).toBe('Omnicorp Holdings');
    expect(nm?.cls).toBe('opposed');
    expect(nm?.dollars).toBeCloseTo(0.45 * 900, 6);
    expect(cur.contributors[0]!.dollars).toBeGreaterThanOrEqual(cur.contributors[1]!.dollars);
    const opt = politicalExposure(state.categories, 'target', ctx);
    expect(opt.shares.opposed).toBeLessThan(cur.shares.opposed);
    expect(opt.shares.aligned).toBeGreaterThan(cur.shares.aligned);
  });

  it('unconfigured preference → everything Unknown, no contributors', () => {
    const state = loadJordan();
    state.political = { configured: false, direction: 0, intensity: 0 };
    const ctx = contextFromState(state);
    const cur = politicalExposure(state.categories, 'current', ctx);
    expect(cur.configured).toBe(false);
    expect(cur.shares.unknown).toBeCloseTo(100, 6);
    expect(cur.contributors).toHaveLength(0);
  });

  it('zero spend → 100% unknown, no NaN', () => {
    const state = loadJordan();
    state.categories = state.categories.map((c) => ({ ...c, monthlySpend: 0 }));
    const ctx = contextFromState(state);
    const cur = politicalExposure(state.categories, 'current', ctx);
    expect(cur.shares.unknown).toBe(100);
    expect(cur.totalSpend).toBe(0);
    const s = scoreOverall(state.categories, 'current', ctx);
    expect(s.index).toBe(50);
    expect(s.band).toEqual([50, 50]);
  });

  it('political principle bites under political-alignment weights (direction flips the sign)', () => {
    const state = loadJordan();
    state.principles = [
      { id: 'political-alignment', label: 'Political', weight: 100, custom: false },
    ];
    state.political = { configured: true, direction: 1, intensity: 1 };
    const up = scoreOverall(state.categories, 'current', contextFromState(state)).index;
    state.political = { configured: true, direction: -1, intensity: 1 };
    const down = scoreOverall(state.categories, 'current', contextFromState(state)).index;
    expect(up + down).toBeCloseTo(100, 6); // symmetric around 50
    expect(up).not.toBeCloseTo(50, 3);
  });
});
