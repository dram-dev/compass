import type { BucketId, CostDelta, Effort, SpendCategory } from './types';
import { DEFAULT_CATEGORIES } from '@/data/categories.defaults';

/**
 * Effort / cost heuristics (spec §6.6). Documented in README → "How effort and cost are rated".
 * Effort 1 (a habit tweak) … 5 (a project). costDelta is the typical ongoing cost of moving money
 * *toward* the aligned destination for that category archetype.
 */
export interface HeuristicRow {
  archetype: string;
  effort: Effort;
  costDelta: CostDelta;
  rationale: string;
}

export const HEURISTICS: HeuristicRow[] = [
  {
    archetype: 'groceries',
    effort: 2,
    costDelta: 'neutral',
    rationale: 'Co-op / farmers-market staples price comparably; needs a route change.',
  },
  {
    archetype: 'dining',
    effort: 1,
    costDelta: 'neutral',
    rationale: 'Choosing an independent café is a habit change with similar prices.',
  },
  {
    archetype: 'fuel',
    effort: 2,
    costDelta: 'small',
    rationale: 'Fewer station choices; occasional detour.',
  },
  {
    archetype: 'retail',
    effort: 2,
    costDelta: 'small',
    rationale: 'Independents rarely match big-box pricing on everything.',
  },
  {
    archetype: 'subscriptions',
    effort: 1,
    costDelta: 'saves',
    rationale: 'Cancelling or consolidating overlapping services saves money.',
  },
  {
    archetype: 'banking',
    effort: 4,
    costDelta: 'neutral',
    rationale: 'Account/policy migration is high effort but carries no ongoing cost.',
  },
  {
    archetype: 'personal-care',
    effort: 1,
    costDelta: 'small',
    rationale: 'Neighborhood salons and gyms are easy to switch to; small price spread.',
  },
  {
    archetype: 'home',
    effort: 3,
    costDelta: 'moderate',
    rationale: 'Bidding projects to local contractors takes time; materials may cost more.',
  },
  {
    archetype: 'charitable',
    effort: 1,
    costDelta: 'neutral',
    rationale: 'Redirecting a gift is a one-time decision.',
  },
];

export const DEFAULT_HEURISTIC: HeuristicRow = {
  archetype: 'other',
  effort: 2,
  costDelta: 'small',
  rationale: 'Unrecognized category — assumed a modest habit change with a small price spread.',
};

/** Large shifts add a point of effort (capped at 5). */
export const LARGE_SHIFT_PTS = 30;

export function matchArchetype(cat: Pick<SpendCategory, 'id' | 'label'>): HeuristicRow {
  const byId = HEURISTICS.find((h) => h.archetype === cat.id);
  if (byId) return byId;
  const label = cat.label.toLowerCase();
  for (const def of DEFAULT_CATEGORIES) {
    if (def.keywords.some((k) => label.includes(k))) {
      const row = HEURISTICS.find((h) => h.archetype === def.id);
      if (row) return row;
    }
  }
  return DEFAULT_HEURISTIC;
}

export interface SwapRating {
  effort: Effort;
  costDelta: CostDelta;
}

/**
 * Rate a shift of `pts` percentage points from → to for a category.
 * Moving money *away* from the aligned direction (toward major/unknown) is treated as cost-neutral
 * with the archetype's effort; moving toward local/regional uses the archetype's costDelta.
 */
export function rateSwap(
  cat: Pick<SpendCategory, 'id' | 'label'>,
  from: BucketId,
  to: BucketId,
  pts: number,
): SwapRating {
  const row = matchArchetype(cat);
  const towardAligned = to === 'local' || (to === 'regional' && from !== 'local');
  let effort = row.effort;
  if (pts >= LARGE_SHIFT_PTS) effort = Math.min(5, effort + 1) as Effort;
  const costDelta: CostDelta = towardAligned
    ? row.costDelta
    : from === 'unknown'
      ? 'neutral'
      : 'neutral';
  return { effort: effort as Effort, costDelta };
}
