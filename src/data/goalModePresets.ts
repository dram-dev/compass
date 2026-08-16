import type { BucketAllocation, BucketId, GoalMode } from '@/engine/types';
import { BUCKET_IDS } from '@/engine/types';

export interface GoalModePreset {
  id: GoalMode;
  label: string;
  short: string;
  /** One-line explanation shown under the segmented control. */
  blurb: string;
  /** Default weights for library principles (0–100). Unlisted library principles → 0. */
  weights: Record<string, number>;
  /**
   * Target preset: how to derive a target midpoint vector from a current one.
   * Returns midpoints (sum 100) — the wizard wraps them into ±5 ranges.
   */
  targetFrom(currentMid: Record<BucketId, number>): Record<BucketId, number>;
}

function shift(
  mid: Record<BucketId, number>,
  from: BucketId,
  to: BucketId,
  pts: number,
): Record<BucketId, number> {
  const amt = Math.max(0, Math.min(mid[from], pts));
  return { ...mid, [from]: mid[from] - amt, [to]: mid[to] + amt };
}

export const GOAL_MODE_PRESETS: Record<GoalMode, GoalModePreset> = {
  'local-first': {
    id: 'local-first',
    label: 'Local-first',
    short: 'Local',
    blurb:
      'Weights: Local economy 60 · Labor 25 · Environment 15. Targets move share from major chains toward independents.',
    weights: { 'local-economy': 60, labor: 25, environment: 15 },
    targetFrom: (m) => {
      let t = shift(m, 'major', 'local', 25);
      t = shift(t, 'unknown', 'local', Math.round(m.unknown / 2));
      return t;
    },
  },
  'political-alignment': {
    id: 'political-alignment',
    label: 'Political alignment',
    short: 'Political',
    blurb:
      'Weights shift hard toward political-support profiles (60). Same dollars, re-scored through a different lens — configure step 3 for this to bite.',
    weights: { 'political-alignment': 60, 'local-economy': 15, labor: 15, environment: 10 },
    targetFrom: (m) => {
      let t = shift(m, 'major', 'local', 15);
      t = shift(t, 'major', 'regional', 5);
      return t;
    },
  },
  'cost-conscious': {
    id: 'cost-conscious',
    label: 'Cost-conscious',
    short: 'Cost',
    blurb:
      'Balanced weights with cost held in view — free wins and money-saving swaps rise to the top of the plan.',
    weights: { 'local-economy': 40, labor: 20, environment: 20, 'political-alignment': 20 },
    targetFrom: (m) => {
      let t = shift(m, 'major', 'local', 10);
      t = shift(t, 'unknown', 'regional', Math.round(m.unknown / 2));
      return t;
    },
  },
  'divest-redirect': {
    id: 'divest-redirect',
    label: 'Divest & redirect',
    short: 'Divest',
    blurb:
      'Emphasis on moving money out of misaligned destinations and into aligned ones, across spend and holdings alike.',
    weights: { 'local-economy': 30, labor: 20, environment: 20, 'political-alignment': 30 },
    targetFrom: (m) => {
      const half = Math.round(m.major / 2);
      let t = shift(m, 'major', 'local', Math.round((half * 2) / 3));
      t = shift(t, 'major', 'regional', half - Math.round((half * 2) / 3));
      return t;
    },
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    short: 'Custom',
    blurb: 'Keep your own weights and targets exactly as you set them.',
    weights: {},
    targetFrom: (m) => ({ ...m }),
  },
};

/** Wrap a midpoint vector into ±halfWidth ranges, clamped to [0,100]. */
export function midpointsToRanges(
  mid: Record<BucketId, number>,
  halfWidth = 5,
  named?: Partial<Record<BucketId, string[]>>,
): BucketAllocation[] {
  return BUCKET_IDS.map((b) => {
    const m = Math.round(mid[b]);
    // symmetric around the midpoint so renormalized midpoints stay exact
    const k = Math.max(0, Math.min(halfWidth, m, 100 - m));
    const lo = m - k;
    const hi = m + k;
    return { bucket: b, rangePct: [lo, hi], namedCompanyIds: [...(named?.[b] ?? [])] };
  });
}
