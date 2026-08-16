import { useMemo } from 'react';
import type { CompassState } from './schema';
import { useCompassStore } from './useCompassStore';
import { SAMPLE_COMPANIES } from '@/data/sampleCompanies';
import {
  buildContext,
  fillGates,
  generateSwaps,
  politicalExposure,
  projectTrajectory,
  radarPoints,
  resolveCompanies,
  scoreOverall,
  summarizeInvestments,
  type FilledPlan,
  type InvestmentsSummary,
  type OverallScore,
  type PoliticalExposure,
  type RadarPoint,
  type ScoringContext,
  type SwapAction,
  type TrajectoryPoint,
} from '@/engine';

export interface Scores {
  ctx: ScoringContext;
  current: OverallScore;
  target: OverallScore;
  political: { current: PoliticalExposure; target: PoliticalExposure };
  swaps: SwapAction[];
  plan: FilledPlan;
  trajectory: TrajectoryPoint[];
  radar: RadarPoint[];
  investments: InvestmentsSummary;
  computeMs: number;
}

export function contextFromState(state: CompassState): ScoringContext {
  return buildContext({
    principles: state.principles,
    bucketDefaults: state.bucketDefaults,
    companies: resolveCompanies(
      SAMPLE_COMPANIES,
      state.importedCompanies,
      state.userCompanies,
      state.companyOverrides,
    ),
    political: state.political,
  });
}

/** Full re-score (pure). Must complete < 100 ms for 12 × 4 (spec §4); typically ~5 ms. */
export function computeScores(state: CompassState): Scores {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ctx = contextFromState(state);
  const current = scoreOverall(state.categories, 'current', ctx);
  const target = scoreOverall(state.categories, 'target', ctx);
  const swaps = generateSwaps(state.categories, ctx);
  const plan = fillGates(swaps, state.gates, current.index, {
    dismissed: state.dismissed,
    placements: state.placements,
  });
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    ctx,
    current,
    target,
    political: {
      current: politicalExposure(state.categories, 'current', ctx),
      target: politicalExposure(state.categories, 'target', ctx),
    },
    swaps,
    plan,
    trajectory: projectTrajectory(current.index, plan.gates, plan.swaps),
    radar: radarPoints(state.categories, ctx),
    investments: summarizeInvestments(state.holdings, ctx),
    computeMs: t1 - t0,
  };
}

/** Memoized scores for the current store state; recomputes only when scoring inputs change. */
export function useScores(): Scores {
  const principles = useCompassStore((s) => s.principles);
  const bucketDefaults = useCompassStore((s) => s.bucketDefaults);
  const userCompanies = useCompassStore((s) => s.userCompanies);
  const importedCompanies = useCompassStore((s) => s.importedCompanies);
  const companyOverrides = useCompassStore((s) => s.companyOverrides);
  const political = useCompassStore((s) => s.political);
  const categories = useCompassStore((s) => s.categories);
  const holdings = useCompassStore((s) => s.holdings);
  const gates = useCompassStore((s) => s.gates);
  const placements = useCompassStore((s) => s.placements);
  const dismissed = useCompassStore((s) => s.dismissed);
  return useMemo(
    () =>
      computeScores({
        ...useCompassStore.getState(),
        principles,
        bucketDefaults,
        userCompanies,
        importedCompanies,
        companyOverrides,
        political,
        categories,
        holdings,
        gates,
        placements,
        dismissed,
      }),
    [
      principles,
      bucketDefaults,
      userCompanies,
      importedCompanies,
      companyOverrides,
      political,
      categories,
      holdings,
      gates,
      placements,
      dismissed,
    ],
  );
}

/** Live company lookup (resolved with overrides) for UI chips/badges. */
export function useCompanies(): Record<string, import('@/engine').Company> {
  const userCompanies = useCompassStore((s) => s.userCompanies);
  const importedCompanies = useCompassStore((s) => s.importedCompanies);
  const companyOverrides = useCompassStore((s) => s.companyOverrides);
  return useMemo(() => {
    const list = resolveCompanies(
      SAMPLE_COMPANIES,
      importedCompanies,
      userCompanies,
      companyOverrides,
    );
    return Object.fromEntries(list.map((c) => [c.id, c]));
  }, [userCompanies, importedCompanies, companyOverrides]);
}
