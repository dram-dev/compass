import type { SpendCategory } from './types';
import { BUCKET_IDS, POLITICAL_PRINCIPLE_ID } from './types';
import type { ScoringContext } from './context';
import { midpoints } from './allocation';
import { bucketDefaultRatings, derivedPoliticalRating, effectiveCompanyRatings } from './alignment';
import type { Which } from './score';
import { totalMonthlySpend } from './score';

export interface RadarPoint {
  principleId: string;
  current: number; // 0..100 coverage
  target: number;
}

/**
 * §8.5 — per-principle "coverage": spend-weighted mean rating on that principle across all bucket
 * portions (named companies or bucket defaults; unknown = 0), mapped from [−2,+2] to [0,100].
 */
export function principleCoverage(
  categories: readonly SpendCategory[],
  which: Which,
  ctx: ScoringContext,
): Record<string, number> {
  const total = totalMonthlySpend(categories);
  const acc: Record<string, number> = {};
  for (const id of ctx.principleIds) acc[id] = 0;
  if (total <= 0) {
    for (const id of ctx.principleIds) acc[id] = 50;
    return acc;
  }
  for (const cat of categories) {
    if (!(cat.monthlySpend > 0)) continue;
    const shares = midpoints(cat[which]);
    const w = cat.monthlySpend / total;
    for (const b of BUCKET_IDS) {
      const portion = (shares[b] / 100) * w;
      if (portion <= 0) continue;
      let ratings: Record<string, number>;
      if (b === 'unknown') {
        ratings = {};
      } else {
        const named = (cat[which].find((a) => a.bucket === b)?.namedCompanyIds ?? [])
          .map((id) => ctx.companies[id])
          .filter((c) => !!c);
        if (named.length === 0) {
          ratings = bucketDefaultRatings(b, ctx);
          ratings[POLITICAL_PRINCIPLE_ID] = derivedPoliticalRating(null, ctx.political);
        } else {
          ratings = {};
          for (const c of named) {
            const r = effectiveCompanyRatings(c!, b, ctx);
            for (const id of ctx.principleIds)
              ratings[id] = (ratings[id] ?? 0) + (r[id] ?? 0) / named.length;
          }
        }
      }
      for (const id of ctx.principleIds) acc[id] = (acc[id] ?? 0) + portion * (ratings[id] ?? 0);
    }
  }
  const out: Record<string, number> = {};
  for (const id of ctx.principleIds) out[id] = ((acc[id]! + 2) / 4) * 100;
  return out;
}

export function radarPoints(
  categories: readonly SpendCategory[],
  ctx: ScoringContext,
): RadarPoint[] {
  const cur = principleCoverage(categories, 'current', ctx);
  const tgt = principleCoverage(categories, 'target', ctx);
  return ctx.principleIds.map((id) => ({
    principleId: id,
    current: cur[id] ?? 50,
    target: tgt[id] ?? 50,
  }));
}
