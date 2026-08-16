import type { Holding, HoldingType, InvestmentBucketId, SleeveId } from './types';
import type { ScoringContext } from './context';
import { effectiveCompanyRatings, derivedPoliticalRating, ratingAlignment } from './alignment';
import { POLITICAL_PRINCIPLE_ID } from './types';

export const SLEEVES: readonly SleeveId[] = [
  'cash',
  'retirement',
  'equities',
  'community',
  'alternatives',
] as const;
export const SLEEVE_LABELS: Record<SleeveId, string> = {
  cash: 'Cash & deposits',
  retirement: 'Retirement funds',
  equities: 'Individual equities',
  community: 'Community notes',
  alternatives: 'Alternatives / crypto',
};

export const INVESTMENT_BUCKETS: readonly InvestmentBucketId[] = [
  'community-aligned',
  'broad-mixed',
  'major-concentrated',
  'unknown-unrated',
] as const;
export const INVESTMENT_BUCKET_LABELS: Record<InvestmentBucketId, string> = {
  'community-aligned': 'Community-aligned',
  'broad-mixed': 'Broad-market / mixed',
  'major-concentrated': 'Major-corp concentrated',
  'unknown-unrated': 'Unknown / unrated',
};

/** Alignment thresholds for bucketing a holding (ASSUMPTIONS #7). */
export const COMMUNITY_THRESHOLD = 0.4;
export const MAJOR_THRESHOLD = -0.4;

/** Representative alignment used when projecting a holding into a *different* target bucket. */
export const BUCKET_REPRESENTATIVE_A: Record<InvestmentBucketId, number> = {
  'community-aligned': 0.8,
  'broad-mixed': 0,
  'major-concentrated': -0.8,
  'unknown-unrated': 0,
};

const TYPE_TO_SLEEVE: Record<HoldingType, SleeveId> = {
  cash: 'cash',
  fund: 'retirement',
  equity: 'equities',
  crypto: 'alternatives',
  other: 'alternatives',
};

export function sleeveOf(h: Holding): SleeveId {
  return h.sleeve ?? TYPE_TO_SLEEVE[h.type];
}

/** Effective ratings for a holding: matched company (if any) under its default bucket, then explicit. */
export function holdingRatings(h: Holding, ctx: ScoringContext): Record<string, number> | null {
  const company = h.companyId ? ctx.companies[h.companyId] : undefined;
  const hasOwn = Object.keys(h.ratings).length > 0;
  if (!company && !hasOwn) return null;
  const base = company ? effectiveCompanyRatings(company, company.bucketDefault, ctx) : {};
  const out: Record<string, number> = { ...base };
  for (const id of ctx.principleIds) {
    if (id === POLITICAL_PRINCIPLE_ID) {
      if (h.ratings[id] !== undefined) out[id] = h.ratings[id]!;
      else if (h.political) out[id] = derivedPoliticalRating(h.political, ctx.political);
      else if (out[id] === undefined) out[id] = 0;
    } else if (h.ratings[id] !== undefined) {
      out[id] = h.ratings[id]!;
    } else if (out[id] === undefined) {
      out[id] = 0;
    }
  }
  return out;
}

/** a ∈ [−1, +1] or null when unrated. */
export function holdingAlignment(h: Holding, ctx: ScoringContext): number | null {
  const r = holdingRatings(h, ctx);
  return r ? ratingAlignment(r, ctx.weights) : null;
}

export function bucketForAlignment(a: number | null): InvestmentBucketId {
  if (a === null) return 'unknown-unrated';
  if (a >= COMMUNITY_THRESHOLD) return 'community-aligned';
  if (a <= MAJOR_THRESHOLD) return 'major-concentrated';
  return 'broad-mixed';
}

/** Vehicle-class-only reallocation language (spec §3.6) — never a specific fund or security. */
export function vehicleClassSuggestion(type: HoldingType, from: InvestmentBucketId): string {
  if (from === 'unknown-unrated') {
    return 'Rate this holding (or import a data pack) before deciding — unassessed money is shown as Unknown, never guessed.';
  }
  switch (type) {
    case 'cash':
      return 'Consider local credit union or community bank deposits (same FDIC/NCUA class of vehicle).';
    case 'fund':
      return 'Consider a values-screened index fund you select, in the same account type.';
    case 'equity':
      return 'Consider community investment notes or a values-screened fund you select.';
    case 'crypto':
    case 'other':
    default:
      return 'Consider community investment notes or a values-screened fund you select.';
  }
}

/** Default "optimal" bucket for a holding under a goal-mode preset (user-editable, R8). */
export function suggestedTargetBucket(h: Holding, current: InvestmentBucketId): InvestmentBucketId {
  if (current === 'unknown-unrated') return 'unknown-unrated';
  if (current === 'community-aligned') return 'community-aligned';
  if (h.type === 'cash') return 'community-aligned';
  if (current === 'major-concentrated') return 'broad-mixed';
  return current;
}

export interface HoldingView {
  holding: Holding;
  sleeve: SleeveId;
  alignment: number | null;
  currentBucket: InvestmentBucketId;
  targetBucket: InvestmentBucketId;
  targetAlignment: number;
  suggestion: string | null; // vehicle-class-only text when target ≠ current
}

export interface SleeveFlow {
  sleeve: SleeveId;
  label: string;
  amount: number;
  current: Record<InvestmentBucketId, number>;
  target: Record<InvestmentBucketId, number>;
}

export interface InvestmentsSummary {
  total: number;
  currentIndex: number;
  targetIndex: number;
  unratedShare: number; // % of portfolio unrated
  holdings: HoldingView[];
  sleeves: SleeveFlow[]; // only sleeves with amount > 0, canonical order
  currentByBucket: Record<InvestmentBucketId, number>;
  targetByBucket: Record<InvestmentBucketId, number>;
  recommendations: HoldingView[]; // holdings with a class move suggested
}

const zeroBuckets = (): Record<InvestmentBucketId, number> => ({
  'community-aligned': 0,
  'broad-mixed': 0,
  'major-concentrated': 0,
  'unknown-unrated': 0,
});

export function summarizeInvestments(
  holdings: readonly Holding[],
  ctx: ScoringContext,
): InvestmentsSummary {
  const views: HoldingView[] = holdings
    .filter((h) => h.amount > 0)
    .map((h) => {
      const a = holdingAlignment(h, ctx);
      const currentBucket = bucketForAlignment(a);
      const targetBucket = h.targetBucket ?? suggestedTargetBucket(h, currentBucket);
      const targetAlignment =
        targetBucket === currentBucket ? (a ?? 0) : BUCKET_REPRESENTATIVE_A[targetBucket];
      return {
        holding: h,
        sleeve: sleeveOf(h),
        alignment: a,
        currentBucket,
        targetBucket,
        targetAlignment,
        suggestion:
          targetBucket !== currentBucket ? vehicleClassSuggestion(h.type, currentBucket) : null,
      };
    });
  const total = views.reduce((s, v) => s + v.holding.amount, 0);
  const currentByBucket = zeroBuckets();
  const targetByBucket = zeroBuckets();
  const sleeveMap = new Map<SleeveId, SleeveFlow>();
  let curS = 0;
  let tgtS = 0;
  let unrated = 0;
  for (const v of views) {
    const amt = v.holding.amount;
    currentByBucket[v.currentBucket] += amt;
    targetByBucket[v.targetBucket] += amt;
    curS += (amt / (total || 1)) * (v.alignment ?? 0);
    tgtS += (amt / (total || 1)) * v.targetAlignment;
    if (v.alignment === null) unrated += amt;
    const sf = sleeveMap.get(v.sleeve) ?? {
      sleeve: v.sleeve,
      label: SLEEVE_LABELS[v.sleeve],
      amount: 0,
      current: zeroBuckets(),
      target: zeroBuckets(),
    };
    sf.amount += amt;
    sf.current[v.currentBucket] += amt;
    sf.target[v.targetBucket] += amt;
    sleeveMap.set(v.sleeve, sf);
  }
  return {
    total,
    currentIndex: total > 0 ? ((curS + 1) / 2) * 100 : 50,
    targetIndex: total > 0 ? ((tgtS + 1) / 2) * 100 : 50,
    unratedShare: total > 0 ? (unrated / total) * 100 : 0,
    holdings: views,
    sleeves: SLEEVES.map((s) => sleeveMap.get(s)).filter((s): s is SleeveFlow => !!s),
    currentByBucket,
    targetByBucket,
    recommendations: views.filter((v) => v.suggestion !== null),
  };
}
