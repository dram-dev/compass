/**
 * Jordan persona parity with the reference demos (CLAUDE.md ground truth):
 * Local-first → current 42.0, optimal 58.9; the groceries swap alone is +5.2 overall.
 */
import { describe, expect, it } from 'vitest';
import { loadJordan } from '@/data/fixtures/jordan';
import { contextFromState } from './testUtils';
import { scoreOverall } from './score';
import { round1 } from './normalize';
import { generateSwaps } from './plan';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { libraryPrinciple } from '@/data/principles';

describe('Jordan persona (Local-first)', () => {
  const state = loadJordan();
  const ctx = contextFromState(state);

  it('has $3,800/mo across 8 categories', () => {
    expect(state.categories).toHaveLength(8);
    expect(state.categories.reduce((s, c) => s + c.monthlySpend, 0)).toBe(3800);
  });

  it('current index 42.0, optimal 58.9', () => {
    const cur = scoreOverall(state.categories, 'current', ctx);
    const opt = scoreOverall(state.categories, 'target', ctx);
    expect(round1(cur.index)).toBe(42.0);
    expect(round1(opt.index)).toBe(58.9);
  });

  it('per-category current indices match the reference demo', () => {
    const cur = scoreOverall(state.categories, 'current', ctx);
    const byId = Object.fromEntries(cur.categories.map((c) => [c.categoryId, round1(c.index)]));
    expect(byId).toEqual({
      groceries: 42.0,
      dining: 64.0,
      fuel: 32.0,
      retail: 32.0,
      subscriptions: 20.0,
      banking: 32.0,
      'personal-care': 66.0,
      home: 44.0,
    });
  });

  it('the groceries swap alone is +5.2 overall', () => {
    const swaps = generateSwaps(state.categories, ctx);
    const gro = swaps.filter((s) => s.categoryId === 'groceries');
    const total = gro.reduce((s, x) => s + x.deltaIndexPoints, 0);
    expect(round1(total)).toBe(5.2);
    // The main grocery move names Jordan's merchants
    expect(gro[0]!.description).toMatch(/NationalMart/);
    expect(gro[0]!.description).toMatch(/Green Fields Co-op/);
  });

  it('uncertainty band brackets the headline number', () => {
    const cur = scoreOverall(state.categories, 'current', ctx);
    expect(cur.band[0]).toBeLessThanOrEqual(cur.index);
    expect(cur.band[1]).toBeGreaterThanOrEqual(cur.index);
    expect(cur.band[1] - cur.band[0]).toBeGreaterThan(0);
  });

  it('re-scores under every goal mode without NaN and stays in [0,100]', () => {
    for (const mode of Object.values(GOAL_MODE_PRESETS)) {
      const s = { ...state };
      if (mode.id !== 'custom') {
        s.principles = Object.entries(mode.weights).map(([id, w]) => libraryPrinciple(id, w));
      }
      const c = contextFromState(s);
      const o = scoreOverall(s.categories, 'current', c);
      expect(Number.isFinite(o.index)).toBe(true);
      expect(o.index).toBeGreaterThanOrEqual(0);
      expect(o.index).toBeLessThanOrEqual(100);
    }
  });
});
