import type { BucketAllocation, BucketId } from './types';
import { BUCKET_IDS } from './types';

export type BucketVector = Record<BucketId, number>;

export const ZERO_VECTOR: BucketVector = { local: 0, regional: 0, major: 0, unknown: 0 };
export const EVEN_VECTOR: BucketVector = { local: 25, regional: 25, major: 25, unknown: 25 };

/** Renormalize a bucket vector to sum 100. Zero-sum → even split (never NaN). */
export function renormalize(v: BucketVector): BucketVector {
  const sum = BUCKET_IDS.reduce((s, b) => s + Math.max(0, v[b]), 0);
  if (sum <= 0) return { ...EVEN_VECTOR };
  const out = { ...ZERO_VECTOR };
  for (const b of BUCKET_IDS) out[b] = (Math.max(0, v[b]) / sum) * 100;
  return out;
}

export type RangePoint = 'min' | 'mid' | 'max';

/** Raw (un-normalized) vector at the chosen point of each bucket's range. Missing bucket → 0. */
export function rawVector(
  allocs: readonly BucketAllocation[],
  at: RangePoint = 'mid',
): BucketVector {
  const out = { ...ZERO_VECTOR };
  for (const a of allocs) {
    const [lo, hi] = a.rangePct;
    const l = Math.min(lo, hi);
    const h = Math.max(lo, hi);
    out[a.bucket] = at === 'min' ? l : at === 'max' ? h : (l + h) / 2;
  }
  return out;
}

/** §6.3 — bucket shares m_b: midpoints renormalized to Σ = 100. */
export function midpoints(
  allocs: readonly BucketAllocation[],
  at: RangePoint = 'mid',
): BucketVector {
  return renormalize(rawVector(allocs, at));
}

/** Move `pts` percentage points from one bucket to another (clamped to what's available). */
export function shiftVector(
  v: BucketVector,
  from: BucketId,
  to: BucketId,
  pts: number,
): BucketVector {
  const amt = Math.max(0, Math.min(v[from], pts));
  return { ...v, [from]: v[from] - amt, [to]: v[to] + amt };
}

/** Ensure an allocation list has all four buckets exactly once, in canonical order. */
export function completeAllocations(allocs: readonly BucketAllocation[]): BucketAllocation[] {
  return BUCKET_IDS.map((b) => {
    const found = allocs.find((a) => a.bucket === b);
    return found
      ? {
          ...found,
          rangePct: [...found.rangePct] as [number, number],
          namedCompanyIds: [...found.namedCompanyIds],
        }
      : { bucket: b, rangePct: [0, 0], namedCompanyIds: [] };
  });
}
