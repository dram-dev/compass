import type { BucketId, SpendCategory, StageGate, SwapAction } from './types';
import { BUCKET_IDS } from './types';
import type { ScoringContext } from './context';
import { midpoints, shiftVector, type BucketVector } from './allocation';
import { categoryBucketAlignments, indexFromShares, totalMonthlySpend } from './score';
import { rateSwap } from './heuristics';

export const MAX_SWAPS_PER_CATEGORY = 3;
export const MIN_SWAP_DELTA = 0.05;

const BUCKET_PHRASE: Record<BucketId, string> = {
  local: 'local independents',
  regional: 'regional chains',
  major: 'major corporations',
  unknown: 'unassessed / other merchants',
};

/** Overall-index delta of shifting `pts` in one category (§6.5 swap test). Linear, exact. */
export function swapDelta(
  cat: SpendCategory,
  from: BucketId,
  to: BucketId,
  pts: number,
  ctx: ScoringContext,
  totalSpend: number,
  baseShares: BucketVector = midpoints(cat.current),
): { deltaIndexPoints: number; categoryIndexAfter: number; categoryIndexBefore: number } {
  const alignments = categoryBucketAlignments(cat, 'current', ctx);
  const before = indexFromShares(baseShares, alignments);
  const after = indexFromShares(shiftVector(baseShares, from, to, pts), alignments);
  const share = totalSpend > 0 ? cat.monthlySpend / totalSpend : 0;
  return {
    deltaIndexPoints: share * (after - before),
    categoryIndexAfter: after,
    categoryIndexBefore: before,
  };
}

export function priorityOf(deltaIndexPoints: number, effort: number): number {
  return effort > 0 ? deltaIndexPoints / effort : 0;
}

export function isFreeWin(deltaIndexPoints: number, costDelta: SwapAction['costDelta']): boolean {
  return deltaIndexPoints > 0 && (costDelta === 'saves' || costDelta === 'neutral');
}

function namedIn(cat: SpendCategory, bucket: BucketId, ctx: ScoringContext): string[] {
  const ids = new Set<string>();
  for (const side of ['target', 'current'] as const) {
    for (const a of cat[side])
      if (a.bucket === bucket) a.namedCompanyIds.forEach((id) => ids.add(id));
  }
  return [...ids].map((id) => ctx.companies[id]?.name).filter((n): n is string => !!n);
}

function phrase(
  cat: SpendCategory,
  bucket: BucketId,
  ctx: ScoringContext,
  useNames: boolean,
): string {
  const names = useNames ? namedIn(cat, bucket, ctx) : [];
  if (names.length === 0) return BUCKET_PHRASE[bucket];
  if (names.length <= 2) return names.join(' / ');
  return `${names.slice(0, 2).join(' / ')} and ${names.length - 2} more`;
}

export function describeSwap(
  cat: SpendCategory,
  from: BucketId,
  to: BucketId,
  pts: number,
  ctx: ScoringContext,
): string {
  const rounded = Math.round(pts / 5) * 5 || Math.round(pts);
  const catLabel = cat.label.toLowerCase();
  if (from === 'major' && to === 'local' && cat.id === 'subscriptions') {
    return `Cancel or swap ~${rounded}% of ${catLabel} from ${phrase(cat, from, ctx, true)} to ${phrase(cat, to, ctx, true)}`;
  }
  return `Shift ~${rounded}% of ${catLabel} spend from ${phrase(cat, from, ctx, true)} to ${phrase(cat, to, ctx, true)}`;
}

/** §6.6 — candidate swaps per category from the largest bucket shifts (cap 3, residual pairing). */
export function generateSwaps(
  categories: readonly SpendCategory[],
  ctx: ScoringContext,
): SwapAction[] {
  const totalSpend = totalMonthlySpend(categories);
  const out: SwapAction[] = [];
  for (const cat of categories) {
    if (!(cat.monthlySpend > 0)) continue;
    const cur = midpoints(cat.current);
    const tgt = midpoints(cat.target);
    const gap: BucketVector = { local: 0, regional: 0, major: 0, unknown: 0 };
    for (const b of BUCKET_IDS) gap[b] = tgt[b] - cur[b];
    let running = { ...cur };
    let n = 0;
    // Pair largest decrease with largest increase, consume residuals.
    for (let guard = 0; guard < 8 && n < MAX_SWAPS_PER_CATEGORY; guard++) {
      const dec = BUCKET_IDS.filter((b) => gap[b] < -0.5).sort((a, b) => gap[a] - gap[b])[0];
      const inc = BUCKET_IDS.filter((b) => gap[b] > 0.5).sort((a, b) => gap[b] - gap[a])[0];
      if (!dec || !inc) break;
      const pts = Math.min(-gap[dec], gap[inc]);
      const { deltaIndexPoints } = swapDelta(cat, dec, inc, pts, ctx, totalSpend, running);
      gap[dec] += pts;
      gap[inc] -= pts;
      running = shiftVector(running, dec, inc, pts);
      if (Math.abs(deltaIndexPoints) < MIN_SWAP_DELTA) continue;
      const { effort, costDelta } = rateSwap(cat, dec, inc, pts);
      out.push({
        id: `${cat.id}:${dec}>${inc}`,
        categoryId: cat.id,
        description: describeSwap(cat, dec, inc, pts, ctx),
        deltaIndexPoints,
        effort,
        costDelta,
        freeWin: isFreeWin(deltaIndexPoints, costDelta),
        gateId: null,
        fromBucket: dec,
        toBucket: inc,
        shiftPct: pts,
        dollarsPerMonth: (pts / 100) * cat.monthlySpend,
        priority: priorityOf(deltaIndexPoints, effort),
        localShift: inc === 'local',
      });
      n++;
    }
  }
  return out;
}

export interface GateConfig {
  id: string;
  label: string;
  effortBudget: number;
}

export const DEFAULT_GATES: GateConfig[] = [
  { id: 'g1', label: 'Day 30', effortBudget: 8 },
  { id: 'g2', label: 'Day 60', effortBudget: 8 },
  { id: 'g3', label: 'Day 90', effortBudget: 8 },
];

export interface FillOptions {
  /** Swap ids the user dismissed — excluded, remembered. */
  dismissed?: readonly string[];
  /** Manual placements (drag) — swapId → gateId. Honored even when over budget. */
  placements?: Readonly<Record<string, string>>;
}

export interface FilledPlan {
  gates: StageGate[];
  swaps: SwapAction[]; // gateId set for scheduled ones; excludes dismissed
  unscheduled: SwapAction[]; // fit nowhere within budgets
  finalIndex: number;
}

/** Sort: free wins first, then priority desc, then delta desc, then id for determinism. */
export function orderSwaps(swaps: readonly SwapAction[]): SwapAction[] {
  return [...swaps].sort(
    (a, b) =>
      Number(b.freeWin) - Number(a.freeWin) ||
      b.priority - a.priority ||
      b.deltaIndexPoints - a.deltaIndexPoints ||
      a.id.localeCompare(b.id),
  );
}

/** §9.2 / EF5 — greedy fill by priority within each gate's budget; projections are cumulative. */
export function fillGates(
  swaps: readonly SwapAction[],
  gateConfigs: readonly GateConfig[],
  currentIndex: number,
  opts: FillOptions = {},
): FilledPlan {
  const dismissed = new Set(opts.dismissed ?? []);
  const placements = opts.placements ?? {};
  const live = orderSwaps(swaps.filter((s) => !dismissed.has(s.id) && s.deltaIndexPoints > 0));
  const gates: StageGate[] = gateConfigs.map((g) => ({
    id: g.id,
    label: g.label,
    effortBudget: g.effortBudget,
    actions: [],
    projectedIndex: currentIndex,
    effortUsed: 0,
  }));
  const gateById = new Map(gates.map((g) => [g.id, g]));
  const scheduled = new Map<string, string>();

  // 1) manual placements first
  for (const s of live) {
    const gid = placements[s.id];
    if (gid && gateById.has(gid)) {
      const g = gateById.get(gid)!;
      g.actions.push(s.id);
      g.effortUsed = (g.effortUsed ?? 0) + s.effort;
      scheduled.set(s.id, gid);
    }
  }
  // 2) greedy for the rest
  const unscheduled: SwapAction[] = [];
  for (const s of live) {
    if (scheduled.has(s.id)) continue;
    const g = gates.find((x) => (x.effortUsed ?? 0) + s.effort <= x.effortBudget);
    if (!g) {
      unscheduled.push(s);
      continue;
    }
    g.actions.push(s.id);
    g.effortUsed = (g.effortUsed ?? 0) + s.effort;
    scheduled.set(s.id, g.id);
  }
  // 3) keep each gate's action list in priority order, and compute cumulative projections
  const rank = new Map(live.map((s, i) => [s.id, i]));
  const byId = new Map(live.map((s) => [s.id, s]));
  let running = currentIndex;
  for (const g of gates) {
    g.actions.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    running += g.actions.reduce((sum, id) => sum + (byId.get(id)?.deltaIndexPoints ?? 0), 0);
    g.projectedIndex = running;
  }
  const withGates = live.map((s) => ({ ...s, gateId: scheduled.get(s.id) ?? null }));
  return { gates, swaps: withGates, unscheduled, finalIndex: running };
}

export interface TrajectoryPoint {
  id: string;
  label: string;
  index: number;
  topAction: string | null;
}

/** §9.3 — projected AlignmentIndex from today through each gate. */
export function projectTrajectory(
  currentIndex: number,
  gates: readonly StageGate[],
  swaps: readonly SwapAction[],
): TrajectoryPoint[] {
  const byId = new Map(swaps.map((s) => [s.id, s]));
  const pts: TrajectoryPoint[] = [
    { id: 'today', label: 'Today', index: currentIndex, topAction: null },
  ];
  for (const g of gates) {
    const top = g.actions
      .map((id) => byId.get(id))
      .filter((s): s is SwapAction => !!s)
      .sort((a, b) => b.deltaIndexPoints - a.deltaIndexPoints)[0];
    pts.push({
      id: g.id,
      label: g.label,
      index: g.projectedIndex,
      topAction: top?.description ?? null,
    });
  }
  return pts;
}
