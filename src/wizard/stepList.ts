/**
 * Canonical wizard steps. `n` is a stable id (deep links `#/wizard/5` and the persisted
 * `wizard.step` always mean the same step), and `detailOnly` steps are skipped in simple mode —
 * their inputs then fall back to the goal-mode preset, which the engine already handles:
 * principles → preset weights, political → unconfigured (everything reads Unknown),
 * investments → skipped, optimal → preset targets.
 */
export const STEPS = [
  { n: 1, label: 'Intent' },
  { n: 2, label: 'Principles', detailOnly: true },
  { n: 3, label: 'Political (private)', detailOnly: true },
  { n: 4, label: 'Current mix' },
  { n: 5, label: 'Investments', detailOnly: true },
  { n: 6, label: 'Your optimal', detailOnly: true },
  { n: 7, label: 'Review' },
] as const;

export type StepDef = (typeof STEPS)[number];

/** Steps visible for a density: simple keeps Intent → Current mix → Review. */
export function visibleSteps(detailed: boolean): readonly StepDef[] {
  return detailed ? STEPS : STEPS.filter((s) => !('detailOnly' in s && s.detailOnly));
}

/** Nearest visible step id at or after `n` (falls back to the last visible one). */
export function clampStep(n: number, detailed: boolean): number {
  const vis = visibleSteps(detailed);
  const hit = vis.find((s) => s.n >= n) ?? vis.at(-1);
  return hit ? hit.n : 1;
}

/** Next/previous visible step id; returns null at the ends. */
export function stepNeighbour(n: number, dir: 1 | -1, detailed: boolean): number | null {
  const vis = visibleSteps(detailed);
  const i = vis.findIndex((s) => s.n === clampStep(n, detailed));
  const j = i + dir;
  return vis[j]?.n ?? null;
}
