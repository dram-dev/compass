import { describe, expect, it } from 'vitest';
import { buildContext, UNCONFIGURED_POLITICAL } from './context';
import {
  bucketAlignment,
  companyAlignment,
  derivedPoliticalRating,
  effectiveCompanyRatings,
  ratingAlignment,
} from './alignment';
import type { Company, Principle } from './types';
import { DEFAULT_BUCKET_RATINGS } from '@/data/bucketDefaults';
import { normalizeWeights } from './normalize';

const principles: Principle[] = [
  { id: 'local-economy', label: 'Local', weight: 50, custom: false },
  { id: 'labor', label: 'Labor', weight: 25, custom: false },
  { id: 'political-alignment', label: 'Political', weight: 25, custom: false },
];

const co = (id: string, ratings: Record<string, number>, lean: number | null): Company => ({
  id,
  name: id,
  sector: 's',
  bucketDefault: 'major',
  political: { leanScore: lean, confidence: 'low', sourceHint: '', provenance: 'sample' },
  ratings,
  ratingsProvenance: 'sample',
});

describe('alignment', () => {
  it('ratingAlignment clamps ratings and ignores unknown principle ids', () => {
    const w = { a: 0.5, b: 0.5 };
    expect(ratingAlignment({ a: 2, b: -2 }, w)).toBe(0);
    expect(ratingAlignment({ a: 4, b: 2, zzz: 9 }, w)).toBe(1);
    expect(ratingAlignment({ a: NaN, b: 2 }, w)).toBe(0.5);
    expect(ratingAlignment({}, w)).toBe(0);
  });

  it('derivedPoliticalRating respects configured/direction/intensity and null lean', () => {
    const p = {
      leanScore: 2,
      confidence: 'low' as const,
      sourceHint: '',
      provenance: 'sample' as const,
    };
    expect(derivedPoliticalRating(p, UNCONFIGURED_POLITICAL)).toBe(0);
    expect(derivedPoliticalRating(p, { configured: true, direction: 0, intensity: 1 })).toBe(0);
    expect(derivedPoliticalRating(p, { configured: true, direction: 1, intensity: 1 })).toBe(2);
    expect(derivedPoliticalRating(p, { configured: true, direction: -1, intensity: 0.5 })).toBe(-1);
    expect(
      derivedPoliticalRating(
        { ...p, leanScore: null },
        { configured: true, direction: 1, intensity: 1 },
      ),
    ).toBe(0);
    expect(derivedPoliticalRating(null, { configured: true, direction: 1, intensity: 1 })).toBe(0);
    expect(derivedPoliticalRating(p, { configured: true, direction: 1, intensity: 7 })).toBe(2);
  });

  it('effective ratings: explicit wins, missing → bucket default, political derived unless explicit', () => {
    const ctx = buildContext({
      principles,
      bucketDefaults: DEFAULT_BUCKET_RATINGS,
      companies: [],
      political: { configured: true, direction: -1, intensity: 1 },
    });
    const c = co('c', { 'local-economy': 1 }, 2);
    expect(effectiveCompanyRatings(c, 'major', ctx)).toEqual({
      'local-economy': 1,
      labor: -1, // bucket default for major
      'political-alignment': -2, // lean 2 × direction −1
    });
    const explicit = co('e', { 'political-alignment': 1 }, 2);
    expect(effectiveCompanyRatings(explicit, 'local', ctx)['political-alignment']).toBe(1);
  });

  it('bucketAlignment: unknown → 0; named companies → equal-weight mean; unresolvable ids ignored', () => {
    const c1 = co('c1', { 'local-economy': 2, labor: 2, 'political-alignment': 2 }, null);
    const c2 = co('c2', { 'local-economy': -2, labor: -2, 'political-alignment': -2 }, null);
    const ctx = buildContext({
      principles,
      bucketDefaults: DEFAULT_BUCKET_RATINGS,
      companies: [c1, c2],
      political: UNCONFIGURED_POLITICAL,
    });
    expect(bucketAlignment('unknown', ['c1'], ctx)).toBe(0);
    expect(bucketAlignment('local', ['c1'], ctx)).toBeCloseTo(1, 10);
    expect(bucketAlignment('local', ['c1', 'c2'], ctx)).toBeCloseTo(0, 10);
    expect(bucketAlignment('local', ['nope'], ctx)).toBeCloseTo(
      bucketAlignment('local', [], ctx),
      10,
    );
    // default local: (0.5×1 + 0.25×0.5 + 0.25×0) = 0.625
    expect(bucketAlignment('local', [], ctx)).toBeCloseTo(0.625, 10);
    expect(companyAlignment(c2, 'major', ctx)).toBeCloseTo(-1, 10);
  });

  it('normalizeWeights ignores negatives and returns zeros for empty', () => {
    expect(
      normalizeWeights([
        { id: 'a', label: 'a', weight: -3, custom: false },
        { id: 'b', label: 'b', weight: 1, custom: false },
      ]),
    ).toEqual({ a: 0, b: 1 });
    expect(normalizeWeights([])).toEqual({});
    expect(normalizeWeights([{ id: 'a', label: 'a', weight: 0, custom: false }])).toEqual({ a: 0 });
  });
});
