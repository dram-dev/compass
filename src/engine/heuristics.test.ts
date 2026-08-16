import { describe, expect, it } from 'vitest';
import { DEFAULT_HEURISTIC, HEURISTICS, matchArchetype, rateSwap } from './heuristics';
import { DEFAULT_CATEGORIES } from '@/data/categories.defaults';

describe('heuristics', () => {
  it('every default category has a heuristic row', () => {
    for (const c of DEFAULT_CATEGORIES)
      expect(HEURISTICS.some((h) => h.archetype === c.id)).toBe(true);
  });
  it('matches by id, then by label keyword, then default', () => {
    expect(matchArchetype({ id: 'banking', label: 'x' }).effort).toBe(4);
    expect(matchArchetype({ id: 'custom-1', label: 'Weekend coffee runs' }).archetype).toBe(
      'dining',
    );
    expect(matchArchetype({ id: 'custom-2', label: 'Streaming stuff' }).archetype).toBe(
      'subscriptions',
    );
    expect(matchArchetype({ id: 'custom-3', label: 'Zorbs' })).toBe(DEFAULT_HEURISTIC);
  });
  it('rates swaps: cost applies toward aligned buckets; large shifts add effort; away-moves are neutral', () => {
    expect(rateSwap({ id: 'retail', label: 'Retail' }, 'major', 'local', 10)).toEqual({
      effort: 2,
      costDelta: 'small',
    });
    expect(rateSwap({ id: 'retail', label: 'Retail' }, 'major', 'local', 35)).toEqual({
      effort: 3,
      costDelta: 'small',
    });
    expect(rateSwap({ id: 'retail', label: 'Retail' }, 'local', 'major', 10)).toEqual({
      effort: 2,
      costDelta: 'neutral',
    });
    expect(rateSwap({ id: 'retail', label: 'Retail' }, 'unknown', 'regional', 10)).toEqual({
      effort: 2,
      costDelta: 'small',
    });
    expect(rateSwap({ id: 'retail', label: 'Retail' }, 'local', 'regional', 10)).toEqual({
      effort: 2,
      costDelta: 'neutral',
    });
    expect(rateSwap({ id: 'banking', label: 'B' }, 'major', 'local', 40).effort).toBe(5);
    expect(rateSwap({ id: 'home', label: 'H' }, 'major', 'local', 40).effort).toBe(4);
  });
});
