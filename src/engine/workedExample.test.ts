/**
 * Spec §6.5 — mandatory worked-example test. Ground truth; must pass EXACTLY.
 */
import { describe, expect, it } from 'vitest';
import type { BucketDefaults, Principle, SpendCategory } from './types';
import { buildContext, UNCONFIGURED_POLITICAL } from './context';
import { bucketAlignment } from './alignment';
import { scoreCategory, scoreOverall } from './score';
import { priorityOf, swapDelta } from './plan';
import { round1 } from './normalize';
import { normalizeWeights } from './normalize';

const principles: Principle[] = [
  { id: 'local-economy', label: 'Local economy', weight: 60, custom: false },
  { id: 'labor', label: 'Labor practices', weight: 40, custom: false },
];

const bucketDefaults: BucketDefaults = {
  local: { 'local-economy': 2, labor: 1 },
  regional: { 'local-economy': 0, labor: 0 },
  major: { 'local-economy': -2, labor: -1 },
  unknown: { 'local-economy': 0, labor: 0 },
};

const ctx = buildContext({
  principles,
  bucketDefaults,
  companies: [],
  political: UNCONFIGURED_POLITICAL,
});

const mk = (
  id: string,
  label: string,
  spend: number,
  mids: [number, number, number, number],
): SpendCategory => ({
  id,
  label,
  monthlySpend: spend,
  current: (['local', 'regional', 'major', 'unknown'] as const).map((b, i) => ({
    bucket: b,
    rangePct: [mids[i]!, mids[i]!],
    namedCompanyIds: [],
  })),
  target: (['local', 'regional', 'major', 'unknown'] as const).map((b, i) => ({
    bucket: b,
    rangePct: [mids[i]!, mids[i]!],
    namedCompanyIds: [],
  })),
});

const groceries = mk('groceries', 'Groceries', 600, [30, 20, 40, 10]);
const dining = mk('dining', 'Dining & coffee', 400, [60, 10, 20, 10]);

describe('§6.5 worked example', () => {
  it('normalizes weights 60/40 → 0.6/0.4', () => {
    expect(normalizeWeights(principles)).toEqual({ 'local-economy': 0.6, labor: 0.4 });
  });

  it('bucket alignments: local 0.8, major −0.8, regional/unknown 0', () => {
    expect(bucketAlignment('local', [], ctx)).toBeCloseTo(0.8, 10);
    expect(bucketAlignment('major', [], ctx)).toBeCloseTo(-0.8, 10);
    expect(bucketAlignment('regional', [], ctx)).toBe(0);
    expect(bucketAlignment('unknown', [], ctx)).toBe(0);
  });

  it('Groceries → S −0.08 → index 46.0; Dining → S 0.32 → index 66.0', () => {
    const g = scoreCategory(groceries, 'current', ctx, 1000);
    const d = scoreCategory(dining, 'current', ctx, 1000);
    expect(round1(g.S)).toBe(-0.1); // −0.08 rounded to 1dp for display
    expect(g.S).toBeCloseTo(-0.08, 10);
    expect(round1(g.index)).toBe(46.0);
    expect(d.S).toBeCloseTo(0.32, 10);
    expect(round1(d.index)).toBe(66.0);
  });

  it('Overall AlignmentIndex = 54.0', () => {
    const o = scoreOverall([groceries, dining], 'current', ctx);
    expect(round1(o.index)).toBe(54.0);
    expect(o.totalSpend).toBe(1000);
  });

  it('Swap: groceries major 40→20, local 30→50 → category 62.0; overall Δ +9.6; priority 4.8 at effort 2', () => {
    const r = swapDelta(groceries, 'major', 'local', 20, ctx, 1000);
    expect(round1(r.categoryIndexAfter)).toBe(62.0);
    expect(round1(r.deltaIndexPoints)).toBe(9.6);
    expect(round1(priorityOf(r.deltaIndexPoints, 2))).toBe(4.8);
  });
});
