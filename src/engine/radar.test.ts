import { describe, expect, it } from 'vitest';
import { loadJordan } from '@/data/fixtures/jordan';
import { contextFromState } from './testUtils';
import { principleCoverage, radarPoints } from './radar';

describe('principles radar', () => {
  it('Jordan: coverage per principle in [0,100], target ≥ current for local economy', () => {
    const state = loadJordan();
    const ctx = contextFromState(state);
    const pts = radarPoints(state.categories, ctx);
    expect(pts.map((p) => p.principleId)).toEqual(state.principles.map((p) => p.id));
    for (const p of pts) {
      expect(p.current).toBeGreaterThanOrEqual(0);
      expect(p.current).toBeLessThanOrEqual(100);
    }
    const le = pts.find((p) => p.principleId === 'local-economy')!;
    expect(le.target).toBeGreaterThan(le.current);
    // political-alignment coverage reflects Jordan's named merchants (not 50 flat)
    const po = pts.find((p) => p.principleId === 'political-alignment')!;
    expect(po.current).not.toBe(50);
  });

  it('zero spend → 50 everywhere', () => {
    const state = loadJordan();
    state.categories = state.categories.map((c) => ({ ...c, monthlySpend: 0 }));
    const cov = principleCoverage(state.categories, 'current', contextFromState(state));
    for (const v of Object.values(cov)) expect(v).toBe(50);
  });
});
