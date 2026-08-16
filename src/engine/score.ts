import type { BucketId, SpendCategory } from './types';
import { BUCKET_IDS } from './types';
import type { ScoringContext } from './context';
import { bucketAlignment } from './alignment';
import { midpoints, type BucketVector, type RangePoint } from './allocation';

export type Which = 'current' | 'target';

export interface CategoryScore {
  categoryId: string;
  label: string;
  monthlySpend: number;
  spendShare: number; // 0..1 of total spend
  S: number; // −1..+1
  index: number; // 0..100 (unrounded)
  band: [number, number]; // index at range-min / range-max allocations, widened to include index
  shares: BucketVector; // renormalized midpoints
  alignments: Record<BucketId, number>; // per-bucket a
}

export interface OverallScore {
  index: number; // unrounded; display with round1
  band: [number, number];
  totalSpend: number;
  categories: CategoryScore[];
}

/** Per-bucket alignment for one side (current/target) of a category. */
export function categoryBucketAlignments(
  cat: SpendCategory,
  which: Which,
  ctx: ScoringContext,
): Record<BucketId, number> {
  const allocs = cat[which];
  const out = { local: 0, regional: 0, major: 0, unknown: 0 } as Record<BucketId, number>;
  for (const b of BUCKET_IDS) {
    const a = allocs.find((x) => x.bucket === b);
    out[b] = bucketAlignment(b, a?.namedCompanyIds ?? [], ctx);
  }
  return out;
}

/** §6.3 — S_cat = Σ_b (m_b/100) × a_b ; index = (S+1)/2 × 100. */
export function indexFromShares(
  shares: BucketVector,
  alignments: Record<BucketId, number>,
): number {
  let S = 0;
  for (const b of BUCKET_IDS) S += (shares[b] / 100) * alignments[b];
  return ((S + 1) / 2) * 100;
}

export function scoreCategory(
  cat: SpendCategory,
  which: Which,
  ctx: ScoringContext,
  totalSpend: number,
): CategoryScore {
  const alignments = categoryBucketAlignments(cat, which, ctx);
  const shares = midpoints(cat[which], 'mid');
  const index = indexFromShares(shares, alignments);
  const atMin = indexFromShares(midpoints(cat[which], 'min'), alignments);
  const atMax = indexFromShares(midpoints(cat[which], 'max'), alignments);
  const lo = Math.min(index, atMin, atMax);
  const hi = Math.max(index, atMin, atMax);
  return {
    categoryId: cat.id,
    label: cat.label,
    monthlySpend: cat.monthlySpend,
    spendShare: totalSpend > 0 ? cat.monthlySpend / totalSpend : 0,
    S: index / 50 - 1,
    index,
    band: [lo, hi],
    shares,
    alignments,
  };
}

export function totalMonthlySpend(categories: readonly SpendCategory[]): number {
  return categories.reduce((s, c) => s + Math.max(0, c.monthlySpend || 0), 0);
}

/** §6.3 — AlignmentIndex = Σ_cat (spend_cat / totalSpend) × index_cat, with uncertainty band. */
export function scoreOverall(
  categories: readonly SpendCategory[],
  which: Which,
  ctx: ScoringContext,
): OverallScore {
  const totalSpend = totalMonthlySpend(categories);
  const scored = categories.map((c) => scoreCategory(c, which, ctx, totalSpend));
  if (totalSpend <= 0) {
    return { index: 50, band: [50, 50], totalSpend: 0, categories: scored };
  }
  const index = scored.reduce((s, c) => s + c.spendShare * c.index, 0);
  const bandAt = (p: RangePoint) =>
    categories.reduce((s, c, i) => {
      const cs = scored[i]!;
      return s + cs.spendShare * indexFromShares(midpoints(c[which], p), cs.alignments);
    }, 0);
  const atMin = bandAt('min');
  const atMax = bandAt('max');
  return {
    index,
    band: [Math.min(index, atMin, atMax), Math.max(index, atMin, atMax)],
    totalSpend,
    categories: scored,
  };
}
