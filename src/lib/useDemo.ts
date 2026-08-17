import { useCompassStore } from '@/store/useCompassStore';
import { useViewStore } from '@/store/useViewMode';
import { loadJordan } from '@/data/fixtures/jordan';

/**
 * Demo scenario (`#/demo`, and the buttons in every empty state).
 *
 * Loads the Jordan persona — a fully worked example: $3,800/month across eight categories, a small
 * portfolio, and a configured political preference — so a reviewer can see a populated app without
 * typing anything. The merchants in it are **fictional archetypes** (Green Fields Co-op, NationalMart…),
 * never real brands with invented figures, and a banner says so for as long as the demo is loaded.
 */
export function useLoadDemo() {
  const loadState = useCompassStore((s) => s.loadState);
  const setDemoActive = useViewStore((s) => s.setDemoActive);
  return () => {
    loadState(loadJordan());
    setDemoActive(true);
  };
}

/** True when the user has data of their own that loading the demo would replace. */
export function useHasOwnData(): boolean {
  const categories = useCompassStore((s) => s.categories);
  const holdings = useCompassStore((s) => s.holdings);
  const demo = useViewStore((s) => s.demoActive);
  if (demo) return false;
  return categories.some((c) => c.monthlySpend > 0) || holdings.length > 0;
}
