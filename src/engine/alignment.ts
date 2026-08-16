import type { BucketId, Company, PoliticalProfile, UserPoliticalPreference } from './types';
import { POLITICAL_PRINCIPLE_ID } from './types';
import type { ScoringContext } from './context';
import { clamp } from './normalize';

/** §6.2 — a = Σ_i w_i × (r_i / 2), r ∈ [−2, +2] → a ∈ [−1, +1]. Missing rating → 0. */
export function ratingAlignment(
  ratings: Record<string, number>,
  weights: Record<string, number>,
): number {
  let a = 0;
  for (const id of Object.keys(weights)) {
    const r = ratings[id];
    if (r === undefined || Number.isNaN(r)) continue;
    a += (weights[id] ?? 0) * (clamp(r, -2, 2) / 2);
  }
  return a;
}

/**
 * Derived political-alignment rating (ASSUMPTIONS #2):
 * clamp(leanScore × direction × intensity, −2, +2); null lean or unconfigured → 0.
 */
export function derivedPoliticalRating(
  profile: PoliticalProfile | null | undefined,
  pref: UserPoliticalPreference,
): number {
  if (!pref.configured || pref.direction === 0) return 0;
  const lean = profile?.leanScore;
  if (lean === null || lean === undefined) return 0;
  return clamp(lean * pref.direction * clamp(pref.intensity, 0, 1), -2, 2);
}

/**
 * Effective ratings for a company standing in `bucket`: explicit ratings win; missing principles
 * fall back to the bucket default; the political principle is derived from leanScore unless the
 * user has rated it explicitly.
 */
export function effectiveCompanyRatings(
  company: Company,
  bucket: BucketId,
  ctx: ScoringContext,
): Record<string, number> {
  const defaults = ctx.bucketDefaults[bucket] ?? {};
  const out: Record<string, number> = {};
  for (const id of ctx.principleIds) {
    if (id === POLITICAL_PRINCIPLE_ID) {
      out[id] =
        company.ratings[id] !== undefined
          ? company.ratings[id]!
          : derivedPoliticalRating(company.political, ctx.political);
    } else {
      out[id] = company.ratings[id] ?? defaults[id] ?? 0;
    }
  }
  return out;
}

export function bucketDefaultRatings(
  bucket: BucketId,
  ctx: ScoringContext,
): Record<string, number> {
  const defaults = ctx.bucketDefaults[bucket] ?? {};
  const out: Record<string, number> = {};
  for (const id of ctx.principleIds) out[id] = defaults[id] ?? 0;
  return out;
}

export function companyAlignment(company: Company, bucket: BucketId, ctx: ScoringContext): number {
  return ratingAlignment(effectiveCompanyRatings(company, bucket, ctx), ctx.weights);
}

/**
 * §6.2 — bucket alignment. `unknown` is always 0. Buckets with named (resolvable) companies use
 * the equal-weight mean of those companies; otherwise the bucket-default ratings.
 */
export function bucketAlignment(
  bucket: BucketId,
  namedCompanyIds: readonly string[],
  ctx: ScoringContext,
): number {
  if (bucket === 'unknown') return 0;
  const named = namedCompanyIds.map((id) => ctx.companies[id]).filter((c): c is Company => !!c);
  if (named.length === 0) {
    return ratingAlignment(bucketDefaultRatings(bucket, ctx), ctx.weights);
  }
  const sum = named.reduce((s, c) => s + companyAlignment(c, bucket, ctx), 0);
  return sum / named.length;
}
