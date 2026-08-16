import type { Principle } from './types';

/** §6.1 — w_i = weight_i / Σ weights across active principles. Zero-sum → all zeros. */
export function normalizeWeights(principles: readonly Principle[]): Record<string, number> {
  const total = principles.reduce((s, p) => s + Math.max(0, p.weight), 0);
  const out: Record<string, number> = {};
  for (const p of principles) out[p.id] = total > 0 ? Math.max(0, p.weight) / total : 0;
  return out;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
