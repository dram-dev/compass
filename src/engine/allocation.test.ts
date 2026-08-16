import { describe, expect, it } from 'vitest';
import { completeAllocations, midpoints, rawVector, renormalize, shiftVector } from './allocation';
import type { BucketAllocation } from './types';

const allocs: BucketAllocation[] = [
  { bucket: 'local', rangePct: [20, 30], namedCompanyIds: [] },
  { bucket: 'regional', rangePct: [15, 25], namedCompanyIds: [] },
  { bucket: 'major', rangePct: [40, 50], namedCompanyIds: [] },
  { bucket: 'unknown', rangePct: [5, 15], namedCompanyIds: [] },
];

describe('allocation', () => {
  it('renormalizes to 100 and handles zero-sum with an even split', () => {
    const r = renormalize({ local: 50, regional: 50, major: 50, unknown: 50 });
    expect(r).toEqual({ local: 25, regional: 25, major: 25, unknown: 25 });
    expect(renormalize({ local: 0, regional: 0, major: 0, unknown: 0 })).toEqual({
      local: 25,
      regional: 25,
      major: 25,
      unknown: 25,
    });
    expect(renormalize({ local: -5, regional: 0, major: 0, unknown: 0 })).toEqual({
      local: 25,
      regional: 25,
      major: 25,
      unknown: 25,
    });
  });

  it('midpoints at mid/min/max; tolerates reversed ranges and missing buckets', () => {
    expect(midpoints(allocs)).toEqual({ local: 25, regional: 20, major: 45, unknown: 10 });
    const atMin = midpoints(allocs, 'min');
    expect(atMin.local).toBeCloseTo(25, 6); // 20/80
    expect(atMin.major).toBeCloseTo(50, 6);
    const atMax = midpoints(allocs, 'max');
    expect(atMax.unknown).toBeCloseTo(12.5, 6); // 15/120
    expect(rawVector([{ bucket: 'local', rangePct: [30, 20], namedCompanyIds: [] }])).toEqual({
      local: 25,
      regional: 0,
      major: 0,
      unknown: 0,
    });
  });

  it('shiftVector moves points and clamps to what is available', () => {
    const v = { local: 30, regional: 20, major: 40, unknown: 10 };
    expect(shiftVector(v, 'major', 'local', 20)).toEqual({
      local: 50,
      regional: 20,
      major: 20,
      unknown: 10,
    });
    expect(shiftVector(v, 'unknown', 'local', 50)).toEqual({
      local: 40,
      regional: 20,
      major: 40,
      unknown: 0,
    });
    expect(shiftVector(v, 'unknown', 'local', -5)).toEqual(v);
  });

  it('completeAllocations fills missing buckets in canonical order', () => {
    const c = completeAllocations([
      { bucket: 'major', rangePct: [10, 20], namedCompanyIds: ['x'] },
    ]);
    expect(c.map((a) => a.bucket)).toEqual(['local', 'regional', 'major', 'unknown']);
    expect(c[2]).toEqual({ bucket: 'major', rangePct: [10, 20], namedCompanyIds: ['x'] });
    expect(c[0]!.rangePct).toEqual([0, 0]);
  });
});
