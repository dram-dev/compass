import { beforeEach, describe, expect, it } from 'vitest';
import { useViewStore, VIEW_STORAGE_KEY } from './useViewMode';
import { STORAGE_KEY } from './schema';
import { clampStep, stepNeighbour, visibleSteps } from '@/wizard/stepList';
import { sectionNumbers } from '@/components/Section';

beforeEach(() => {
  localStorage.clear();
  useViewStore.setState({ viewMode: 'simple', viewModeTouched: false });
});

describe('display density', () => {
  it('defaults to simple, persists to its own key, and never touches the plan state', () => {
    expect(useViewStore.getState().viewMode).toBe('simple');
    useViewStore.getState().setViewMode('detailed');
    expect(useViewStore.getState()).toMatchObject({
      viewMode: 'detailed',
      viewModeTouched: true,
    });
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.viewMode).toBe('detailed');
    // the plan state (and therefore the JSON export contract) is untouched by a density switch
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(VIEW_STORAGE_KEY).not.toBe(STORAGE_KEY);
  });

  it('visible wizard steps: 3 in simple (ids 1/4/7), all 7 in detailed', () => {
    expect(visibleSteps(false).map((s) => s.n)).toEqual([1, 4, 7]);
    expect(visibleSteps(true).map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('clampStep moves hidden steps forward to the nearest visible id', () => {
    expect(clampStep(1, false)).toBe(1);
    expect(clampStep(2, false)).toBe(4); // Principles hidden → Current mix
    expect(clampStep(3, false)).toBe(4);
    expect(clampStep(5, false)).toBe(7); // Investments/optimal hidden → Review
    expect(clampStep(7, false)).toBe(7);
    expect(clampStep(5, true)).toBe(5); // detailed keeps every id
  });

  it('stepNeighbour walks the visible path and stops at both ends', () => {
    expect(stepNeighbour(1, 1, false)).toBe(4);
    expect(stepNeighbour(4, 1, false)).toBe(7);
    expect(stepNeighbour(7, 1, false)).toBeNull();
    expect(stepNeighbour(4, -1, false)).toBe(1);
    expect(stepNeighbour(1, -1, false)).toBeNull();
    expect(stepNeighbour(1, 1, true)).toBe(2);
    expect(stepNeighbour(3, -1, true)).toBe(2);
  });

  it('sectionNumbers closes the gaps left by hidden panels', () => {
    const flags = [false, false, true, true, true, false];
    expect(sectionNumbers(flags, true)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(sectionNumbers(flags, false)).toEqual(['01', '02', '', '', '', '03']);
  });
});
