import { describe, expect, it } from 'vitest';
import { loadJordan } from '@/data/fixtures/jordan';
import { contextFromState } from './testUtils';
import {
  bucketForAlignment,
  holdingAlignment,
  sleeveOf,
  suggestedTargetBucket,
  summarizeInvestments,
  vehicleClassSuggestion,
} from './investments';
import type { Holding } from './types';

const state = loadJordan();
const ctx = contextFromState(state);

describe('investments', () => {
  it('Jordan portfolio: $86k, sleeves match the reference demo, unrated is Unknown', () => {
    const s = summarizeInvestments(state.holdings, ctx);
    expect(s.total).toBe(86000);
    const cash = s.sleeves.find((x) => x.sleeve === 'cash')!;
    expect(cash.amount).toBe(18000);
    expect(cash.current['major-concentrated']).toBe(12000);
    expect(cash.current['community-aligned']).toBe(6000);
    expect(cash.target['community-aligned']).toBe(18000);
    const ret = s.sleeves.find((x) => x.sleeve === 'retirement')!;
    expect(ret.amount).toBe(52000);
    expect(ret.current['unknown-unrated']).toBe(2000);
    expect(s.sleeves.find((x) => x.sleeve === 'community')!.amount).toBe(2000);
    expect(s.sleeves.find((x) => x.sleeve === 'alternatives')!.amount).toBe(5000);
    expect(s.currentByBucket['unknown-unrated']).toBe(7000);
    // Unknown never redistributed in the target either
    expect(s.targetByBucket['unknown-unrated']).toBe(7000);
    expect(s.unratedShare).toBeCloseTo((7000 / 86000) * 100, 6);
    expect(s.targetIndex).toBeGreaterThan(s.currentIndex);
    expect(s.recommendations.length).toBeGreaterThan(0);
    for (const r of s.recommendations)
      expect(r.suggestion).toMatch(/credit union|screened|community/i);
  });

  it('holdingAlignment: company match, explicit ratings, political derivation, unrated → null', () => {
    const [checking, savings, k401, , b403, mega, cdfi, crypto] = state.holdings as [
      Holding,
      Holding,
      Holding,
      Holding,
      Holding,
      Holding,
      Holding,
      Holding,
    ];
    expect(holdingAlignment(checking, ctx)).toBeCloseTo(-0.8, 10);
    expect(holdingAlignment(savings, ctx)).toBeCloseTo(0.8, 10);
    expect(holdingAlignment(k401, ctx)).toBeCloseTo(-0.8, 10);
    expect(holdingAlignment(b403, ctx)).toBeNull();
    expect(holdingAlignment(crypto, ctx)).toBeNull();
    expect(bucketForAlignment(holdingAlignment(mega, ctx))).toBe('major-concentrated');
    expect(bucketForAlignment(holdingAlignment(cdfi, ctx))).toBe('community-aligned');
    // political weight on: MegaTech's own political profile feeds the derived rating
    const s2 = loadJordan();
    s2.principles = [{ id: 'political-alignment', label: 'P', weight: 100, custom: false }];
    const c2 = contextFromState(s2);
    expect(holdingAlignment(mega, c2)).toBeCloseTo(-0.3, 10); // −1 × +1 × 0.6 / 2
    // holding with an explicit political rating overrides derivation
    expect(holdingAlignment({ ...mega, ratings: { 'political-alignment': 2 } }, c2)).toBeCloseTo(
      1,
      10,
    );
    // company-matched holding with no own political → derived from company lean
    expect(holdingAlignment(checking, c2)).toBeCloseTo(-0.6, 10); // Colossus −2 × 1 × 0.6 / 2
  });

  it('bucket thresholds and sleeve mapping', () => {
    expect(bucketForAlignment(null)).toBe('unknown-unrated');
    expect(bucketForAlignment(0.4)).toBe('community-aligned');
    expect(bucketForAlignment(0.39)).toBe('broad-mixed');
    expect(bucketForAlignment(-0.4)).toBe('major-concentrated');
    expect(bucketForAlignment(-0.39)).toBe('broad-mixed');
    const h = (type: Holding['type'], sleeve?: Holding['sleeve']): Holding => ({
      id: 'x',
      label: 'x',
      type,
      amount: 1,
      ratings: {},
      political: null,
      sleeve,
    });
    expect(sleeveOf(h('cash'))).toBe('cash');
    expect(sleeveOf(h('fund'))).toBe('retirement');
    expect(sleeveOf(h('equity'))).toBe('equities');
    expect(sleeveOf(h('crypto'))).toBe('alternatives');
    expect(sleeveOf(h('other'))).toBe('alternatives');
    expect(sleeveOf(h('other', 'community'))).toBe('community');
  });

  it('suggestions are vehicle-class only and never name a fund/security', () => {
    const forbidden = /vanguard|fidelity|schwab|blackrock|ishares|spy|vti|qqq|tesla|apple|bitcoin/i;
    for (const t of ['cash', 'fund', 'equity', 'crypto', 'other'] as const) {
      for (const b of [
        'community-aligned',
        'broad-mixed',
        'major-concentrated',
        'unknown-unrated',
      ] as const) {
        expect(vehicleClassSuggestion(t, b)).not.toMatch(forbidden);
      }
    }
    const h = (type: Holding['type']): Holding => ({
      id: 'x',
      label: 'x',
      type,
      amount: 1,
      ratings: {},
      political: null,
    });
    expect(suggestedTargetBucket(h('cash'), 'major-concentrated')).toBe('community-aligned');
    expect(suggestedTargetBucket(h('fund'), 'major-concentrated')).toBe('broad-mixed');
    expect(suggestedTargetBucket(h('fund'), 'broad-mixed')).toBe('broad-mixed');
    expect(suggestedTargetBucket(h('fund'), 'unknown-unrated')).toBe('unknown-unrated');
    expect(suggestedTargetBucket(h('fund'), 'community-aligned')).toBe('community-aligned');
  });

  it('empty portfolio is safe', () => {
    const s = summarizeInvestments([], ctx);
    expect(s.total).toBe(0);
    expect(s.currentIndex).toBe(50);
    expect(s.sleeves).toHaveLength(0);
    expect(s.unratedShare).toBe(0);
    const z = summarizeInvestments(
      [{ id: 'z', label: 'z', type: 'cash', amount: 0, ratings: {}, political: null }],
      ctx,
    );
    expect(z.holdings).toHaveLength(0);
  });
});
