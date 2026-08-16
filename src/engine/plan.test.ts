import { describe, expect, it } from 'vitest';
import { loadJordan } from '@/data/fixtures/jordan';
import { contextFromState } from './testUtils';
import {
  DEFAULT_GATES,
  describeSwap,
  fillGates,
  generateSwaps,
  isFreeWin,
  orderSwaps,
  projectTrajectory,
} from './plan';
import { scoreOverall } from './score';
import { round1 } from './normalize';
import type { SwapAction } from './types';

const state = loadJordan();
const ctx = contextFromState(state);
const current = scoreOverall(state.categories, 'current', ctx).index;
const optimal = scoreOverall(state.categories, 'target', ctx).index;
const swaps = generateSwaps(state.categories, ctx);

describe('swap generation', () => {
  it('produces ≤ 3 candidates per category with positive deltas summing to the total gap', () => {
    for (const cat of state.categories) {
      expect(swaps.filter((s) => s.categoryId === cat.id).length).toBeLessThanOrEqual(3);
    }
    const total = swaps.reduce((s, x) => s + x.deltaIndexPoints, 0);
    expect(round1(total)).toBe(round1(optimal - current)); // 16.9 for Jordan
    for (const s of swaps) {
      expect(s.priority).toBeCloseTo(s.deltaIndexPoints / s.effort, 10);
      expect(s.freeWin).toBe(isFreeWin(s.deltaIndexPoints, s.costDelta));
      expect(s.dollarsPerMonth).toBeGreaterThan(0);
    }
  });

  it('subscriptions swap is a free win that saves money; banking is high effort', () => {
    const sub = swaps.find((s) => s.categoryId === 'subscriptions')!;
    expect(sub.costDelta).toBe('saves');
    expect(sub.freeWin).toBe(true);
    expect(sub.effort).toBe(1);
    const bank = swaps.find((s) => s.categoryId === 'banking' && s.toBucket === 'local')!;
    expect(bank.effort).toBeGreaterThanOrEqual(4);
    expect(bank.description).toMatch(/Colossus Bank/);
    expect(bank.description).toMatch(/First Prairie Credit Union/);
  });

  it('describeSwap falls back to bucket phrases when nothing is named', () => {
    const dining = state.categories.find((c) => c.id === 'dining')!;
    expect(describeSwap(dining, 'major', 'local', 5, ctx)).toBe(
      'Shift ~5% of dining & coffee spend from major corporations to local independents',
    );
  });

  it('skips categories with zero spend and swaps below the minimum delta', () => {
    const s2 = loadJordan();
    s2.categories[0]!.monthlySpend = 0;
    const c2 = contextFromState(s2);
    expect(generateSwaps(s2.categories, c2).some((s) => s.categoryId === 'groceries')).toBe(false);
    // identical current & target → no swaps
    s2.categories = s2.categories.map((c) => ({ ...c, target: c.current }));
    expect(generateSwaps(s2.categories, c2)).toHaveLength(0);
  });
});

describe('gate filling', () => {
  it('fills greedily within budgets, free wins first, cumulative projections reach the sum of scheduled deltas', () => {
    const plan = fillGates(swaps, DEFAULT_GATES, current);
    for (const g of plan.gates) expect(g.effortUsed!).toBeLessThanOrEqual(g.effortBudget);
    const g1 = plan.gates[0]!;
    const byId = new Map(plan.swaps.map((s) => [s.id, s]));
    const firstFree = g1.actions.map((id) => byId.get(id)!).findIndex((s) => !s.freeWin);
    const lastFree = g1.actions
      .map((id) => byId.get(id)!)
      .map((s) => s.freeWin)
      .lastIndexOf(true);
    if (firstFree >= 0) expect(lastFree).toBeLessThan(firstFree);
    let running = current;
    for (const g of plan.gates) {
      running += g.actions.reduce((s, id) => s + byId.get(id)!.deltaIndexPoints, 0);
      expect(g.projectedIndex).toBeCloseTo(running, 10);
    }
    expect(plan.finalIndex).toBeCloseTo(running, 10);
    const scheduled = plan.swaps.filter((s) => s.gateId).length;
    expect(scheduled + plan.unscheduled.length).toBe(plan.swaps.length);
    expect(plan.finalIndex).toBeLessThanOrEqual(optimal + 1e-9);
  });

  it('dismissed swaps are excluded and remembered out of the projection', () => {
    const base = fillGates(swaps, DEFAULT_GATES, current);
    const victim = base.swaps.find((s) => s.gateId === 'g1')!;
    const plan = fillGates(swaps, DEFAULT_GATES, current, { dismissed: [victim.id] });
    expect(plan.swaps.some((s) => s.id === victim.id)).toBe(false);
    expect(plan.finalIndex).toBeLessThanOrEqual(base.finalIndex + 1e-9);
  });

  it('reallocation math: dragging an action to a later gate moves its delta out of the earlier projection', () => {
    const base = fillGates(swaps, DEFAULT_GATES, current);
    const moved = base.swaps.find((s) => s.gateId === 'g1')!;
    const plan = fillGates(swaps, DEFAULT_GATES, current, { placements: { [moved.id]: 'g3' } });
    const g1b = base.gates[0]!;
    const g1 = plan.gates[0]!;
    expect(plan.swaps.find((s) => s.id === moved.id)!.gateId).toBe('g3');
    expect(plan.gates[2]!.actions).toContain(moved.id);
    // Gate 1 may backfill with the next candidate; whatever happens, projection == current + Σ deltas.
    const byId = new Map(plan.swaps.map((s) => [s.id, s]));
    expect(g1.projectedIndex).toBeCloseTo(
      current + g1.actions.reduce((s, id) => s + byId.get(id)!.deltaIndexPoints, 0),
      10,
    );
    expect(g1.actions).not.toContain(moved.id);
    expect(g1b.actions).toContain(moved.id);
    // Final index unchanged if the same set is scheduled
    const setA = new Set(base.swaps.filter((s) => s.gateId).map((s) => s.id));
    const setB = new Set(plan.swaps.filter((s) => s.gateId).map((s) => s.id));
    if (setA.size === setB.size && [...setA].every((id) => setB.has(id))) {
      expect(plan.finalIndex).toBeCloseTo(base.finalIndex, 10);
    }
  });

  it('manual placement is honored even over budget; unknown gate ids fall back to greedy', () => {
    const tiny = [{ id: 'g1', label: 'Day 30', effortBudget: 1 }];
    const big = swaps.find((s) => s.effort >= 4)!;
    const plan = fillGates(swaps, tiny, current, {
      placements: { [big.id]: 'g1', nope: 'g1', [swaps[0]!.id]: 'zzz' },
    });
    expect(plan.gates[0]!.actions).toContain(big.id);
    expect(plan.gates[0]!.effortUsed!).toBeGreaterThan(1);
  });

  it('orderSwaps is deterministic: free wins, then priority, then delta, then id', () => {
    const mk = (id: string, fw: boolean, pr: number, d: number): SwapAction => ({
      id,
      categoryId: 'x',
      description: '',
      deltaIndexPoints: d,
      effort: 1,
      costDelta: 'small',
      freeWin: fw,
      gateId: null,
      fromBucket: 'major',
      toBucket: 'local',
      shiftPct: 1,
      dollarsPerMonth: 1,
      priority: pr,
      localShift: true,
    });
    const out = orderSwaps([
      mk('b', false, 5, 5),
      mk('a', true, 1, 1),
      mk('c', false, 5, 6),
      mk('d', false, 5, 6),
    ]);
    expect(out.map((s) => s.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('projectTrajectory starts at today and annotates each gate with its top action', () => {
    const plan = fillGates(swaps, DEFAULT_GATES, current);
    const t = projectTrajectory(current, plan.gates, plan.swaps);
    expect(t).toHaveLength(4);
    expect(t[0]).toMatchObject({ id: 'today', label: 'Today', index: current, topAction: null });
    expect(t[1]!.topAction).toBeTruthy();
    expect(t[3]!.index).toBeCloseTo(plan.finalIndex, 10);
    const empty = projectTrajectory(
      current,
      [{ id: 'g', label: 'G', effortBudget: 8, actions: [], projectedIndex: current }],
      [],
    );
    expect(empty[1]!.topAction).toBeNull();
  });
});
