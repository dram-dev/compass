import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Display density, kept OUT of the plan state on purpose (ASSUMPTIONS #73): it is a per-device
 * display preference, not part of the user's plan, so an exported/imported plan never dictates the
 * reader's density and the v1 export contract stays byte-stable.
 *
 *   simple   — the short path: essentials only (spend, flows, gaps, plan). New visitors start here.
 *   detailed — every panel: political streams, principles radar, tradeoffs, research-DB look-throughs.
 */
export type ViewMode = 'simple' | 'detailed';
export const VIEW_STORAGE_KEY = 'compass.ui.v1';

export interface ViewState {
  viewMode: ViewMode;
  /** true once the user has switched density themselves — suppresses the first-run hint. */
  viewModeTouched: boolean;
  /**
   * True while the demo persona is loaded. Kept here rather than in the plan state so it is a
   * property of *this browser's session*, never of an exported plan: a reviewer who exports demo
   * data and imports it elsewhere gets ordinary editable data, not a permanent "demo" label.
   */
  demoActive: boolean;
  setViewMode(mode: ViewMode): void;
  setDemoActive(active: boolean): void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      viewMode: 'simple',
      viewModeTouched: false,
      demoActive: false,
      setViewMode: (viewMode) => set({ viewMode, viewModeTouched: true }),
      setDemoActive: (demoActive) => set({ demoActive }),
    }),
    { name: VIEW_STORAGE_KEY, version: 1 },
  ),
);

export const useViewMode = (): ViewMode => useViewStore((s) => s.viewMode);
export const useDemoActive = (): boolean => useViewStore((s) => s.demoActive);
export const useIsDetailed = (): boolean => useViewStore((s) => s.viewMode === 'detailed');
