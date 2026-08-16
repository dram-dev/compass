import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  BucketAllocation,
  BucketId,
  Company,
  GoalMode,
  Holding,
  Principle,
  SpendCategory,
  UserPoliticalPreference,
} from '@/engine/types';
import { BUCKET_IDS } from '@/engine/types';
import type { GateConfig } from '@/engine/plan';
import { DEFAULT_GATES } from '@/engine/plan';
import { midpoints } from '@/engine/allocation';
import { GOAL_MODE_PRESETS, midpointsToRanges } from '@/data/goalModePresets';
import { blankCategory } from '@/data/categories.defaults';
import { DEFAULT_BUCKET_RATINGS } from '@/data/bucketDefaults';
import { libraryPrinciple } from '@/data/principles';
import { makeUserCompany, slugId } from '@/engine/companies';
import type { CompanyOverride, CompassState, WizardMeta } from './schema';
import { SCHEMA_VERSION, STORAGE_KEY } from './schema';
import { initialState, principlesForMode } from './defaults';
import { migrateState } from './migrations';
import { normalizeState } from './validate';
import { pickState } from './persistence';

export type Which = 'current' | 'target';

export interface CompassActions {
  // profile / mode
  setProfileName(name: string): void;
  setGoalMode(mode: GoalMode): void;
  // principles
  setPrincipleWeight(id: string, weight: number): void;
  addLibraryPrinciple(id: string, weight?: number): void;
  addCustomPrinciple(label: string, weight?: number): string;
  removePrinciple(id: string): void;
  renamePrinciple(id: string, label: string): void;
  // political
  setPolitical(pref: UserPoliticalPreference): void;
  // categories
  addCategory(label?: string): string;
  removeCategory(id: string): void;
  renameCategory(id: string, label: string): void;
  setCategorySpend(id: string, monthlySpend: number): void;
  setRange(id: string, which: Which, bucket: BucketId, range: [number, number]): void;
  addNamedCompany(id: string, which: Which, bucket: BucketId, companyId: string): void;
  removeNamedCompany(id: string, which: Which, bucket: BucketId, companyId: string): void;
  applyTargetPreset(categoryId?: string): void;
  // holdings
  addHolding(partial?: Partial<Holding>): string;
  updateHolding(id: string, patch: Partial<Holding>): void;
  removeHolding(id: string): void;
  // companies
  addUserCompany(name: string, bucketDefault: BucketId): Company;
  setCompanyOverride(id: string, patch: CompanyOverride): void;
  clearCompanyOverride(id: string): void;
  importCompanies(companies: Company[], source: string): number;
  // bucket defaults
  setBucketDefault(bucket: BucketId, principleId: string, value: number): void;
  resetBucketDefaults(): void;
  // gates / plan
  setGates(gates: GateConfig[]): void;
  updateGate(id: string, patch: Partial<GateConfig>): void;
  addGate(): void;
  removeGate(id: string): void;
  placeAction(swapId: string, gateId: string | null): void;
  dismissAction(swapId: string): void;
  restoreAction(swapId: string): void;
  clearPlanEdits(): void;
  // wizard
  setWizardStep(step: number): void;
  completeWizard(): void;
  // whole-state
  loadState(state: CompassState): void;
  resetAll(): void;
}

export type CompassStore = CompassState & CompassActions;

const touch = (s: CompassState): Pick<CompassState, 'profile'> => ({
  profile: { ...s.profile, updatedAt: new Date().toISOString() },
});

function updateCategory(
  categories: SpendCategory[],
  id: string,
  fn: (c: SpendCategory) => SpendCategory,
): SpendCategory[] {
  return categories.map((c) => (c.id === id ? fn(c) : c));
}

function updateAlloc(
  allocs: BucketAllocation[],
  bucket: BucketId,
  fn: (a: BucketAllocation) => BucketAllocation,
): BucketAllocation[] {
  const has = allocs.some((a) => a.bucket === bucket);
  const base = has
    ? allocs
    : [...allocs, { bucket, rangePct: [0, 0] as [number, number], namedCompanyIds: [] }];
  return base.map((a) => (a.bucket === bucket ? fn(a) : a));
}

function presetTargetsFor(cat: SpendCategory, mode: GoalMode): BucketAllocation[] {
  const preset = GOAL_MODE_PRESETS[mode];
  const cur = midpoints(cat.current);
  const tgt = preset.targetFrom(cur);
  const named: Partial<Record<BucketId, string[]>> = {};
  for (const b of BUCKET_IDS) {
    named[b] =
      cat.target.find((a) => a.bucket === b)?.namedCompanyIds ??
      cat.current.find((a) => a.bucket === b)?.namedCompanyIds ??
      [];
  }
  return midpointsToRanges(tgt, 5, named);
}

let idCounter = 0;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export const useCompassStore = create<CompassStore>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setProfileName: (name) =>
        set((s) => ({ profile: { ...s.profile, name, updatedAt: new Date().toISOString() } })),

      setGoalMode: (mode) =>
        set((s) => {
          const principles =
            mode === 'custom' ? s.principles : principlesForMode(mode, s.principles);
          const categories =
            mode !== 'custom' && !s.wizard.targetsCustomized
              ? s.categories.map((c) => ({ ...c, target: presetTargetsFor(c, mode) }))
              : s.categories;
          return { goalMode: mode, principles, categories, ...touch(s) };
        }),

      setPrincipleWeight: (id, weight) =>
        set((s) => ({
          principles: s.principles.map((p) =>
            p.id === id ? { ...p, weight: Math.max(0, Math.min(100, weight)) } : p,
          ),
          ...touch(s),
        })),
      addLibraryPrinciple: (id, weight = 20) =>
        set((s) =>
          s.principles.some((p) => p.id === id)
            ? {}
            : { principles: [...s.principles, libraryPrinciple(id, weight)], ...touch(s) },
        ),
      addCustomPrinciple: (label, weight = 20) => {
        const id = slugId(label, 'custom');
        set((s) => {
          if (s.principles.some((p) => p.id === id)) return {};
          const p: Principle = { id, label: label.trim(), weight, custom: true };
          return { principles: [...s.principles, p], ...touch(s) };
        });
        return id;
      },
      removePrinciple: (id) =>
        set((s) => ({ principles: s.principles.filter((p) => p.id !== id), ...touch(s) })),
      renamePrinciple: (id, label) =>
        set((s) => ({
          principles: s.principles.map((p) => (p.id === id ? { ...p, label } : p)),
          ...touch(s),
        })),

      setPolitical: (pref) =>
        set((s) => ({
          political: { ...pref, intensity: Math.max(0, Math.min(1, pref.intensity)) },
          ...touch(s),
        })),

      addCategory: (label = 'New category') => {
        const id = uid('cat');
        set((s) => ({ categories: [...s.categories, blankCategory(id, label, 0)], ...touch(s) }));
        return id;
      },
      removeCategory: (id) =>
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id), ...touch(s) })),
      renameCategory: (id, label) =>
        set((s) => ({
          categories: updateCategory(s.categories, id, (c) => ({ ...c, label })),
          ...touch(s),
        })),
      setCategorySpend: (id, monthlySpend) =>
        set((s) => ({
          categories: updateCategory(s.categories, id, (c) => ({
            ...c,
            monthlySpend: Math.max(0, Number.isFinite(monthlySpend) ? monthlySpend : 0),
          })),
          ...touch(s),
        })),
      setRange: (id, which, bucket, range) =>
        set((s) => {
          const lo = Math.max(0, Math.min(100, Math.min(range[0], range[1])));
          const hi = Math.max(0, Math.min(100, Math.max(range[0], range[1])));
          return {
            categories: updateCategory(s.categories, id, (c) => ({
              ...c,
              [which]: updateAlloc(c[which], bucket, (a) => ({ ...a, rangePct: [lo, hi] })),
            })),
            wizard: which === 'target' ? { ...s.wizard, targetsCustomized: true } : s.wizard,
            ...touch(s),
          };
        }),
      addNamedCompany: (id, which, bucket, companyId) =>
        set((s) => ({
          categories: updateCategory(s.categories, id, (c) => ({
            ...c,
            [which]: updateAlloc(c[which], bucket, (a) =>
              a.namedCompanyIds.includes(companyId)
                ? a
                : { ...a, namedCompanyIds: [...a.namedCompanyIds, companyId] },
            ),
          })),
          ...touch(s),
        })),
      removeNamedCompany: (id, which, bucket, companyId) =>
        set((s) => ({
          categories: updateCategory(s.categories, id, (c) => ({
            ...c,
            [which]: updateAlloc(c[which], bucket, (a) => ({
              ...a,
              namedCompanyIds: a.namedCompanyIds.filter((x) => x !== companyId),
            })),
          })),
          ...touch(s),
        })),
      applyTargetPreset: (categoryId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            !categoryId || c.id === categoryId
              ? { ...c, target: presetTargetsFor(c, s.goalMode) }
              : c,
          ),
          wizard: categoryId ? s.wizard : { ...s.wizard, targetsCustomized: false },
          ...touch(s),
        })),

      addHolding: (partial = {}) => {
        const id = partial.id ?? uid('h');
        const h: Holding = {
          id,
          label: '',
          type: 'cash',
          amount: 0,
          ratings: {},
          political: null,
          ...partial,
        };
        set((s) => ({ holdings: [...s.holdings, h], ...touch(s) }));
        return id;
      },
      updateHolding: (id, patch) =>
        set((s) => ({
          holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
          ...touch(s),
        })),
      removeHolding: (id) =>
        set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id), ...touch(s) })),

      addUserCompany: (name, bucketDefault) => {
        const existing = get().userCompanies.find(
          (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
        );
        if (existing) return existing;
        let id = slugId(name);
        const taken = new Set(
          [...get().userCompanies, ...get().importedCompanies].map((c) => c.id),
        );
        let n = 2;
        while (taken.has(id)) id = `${slugId(name)}-${n++}`;
        const c = makeUserCompany(name, bucketDefault, id);
        set((s) => ({ userCompanies: [...s.userCompanies, c], ...touch(s) }));
        return c;
      },
      setCompanyOverride: (id, patch) =>
        set((s) => {
          const prev = s.companyOverrides[id] ?? {};
          const next: CompanyOverride = {
            ...prev,
            ...patch,
            ...(patch.ratings ? { ratings: { ...(prev.ratings ?? {}), ...patch.ratings } } : {}),
            ...(patch.political
              ? { political: { ...(prev.political ?? {}), ...patch.political } }
              : {}),
          };
          return { companyOverrides: { ...s.companyOverrides, [id]: next }, ...touch(s) };
        }),
      clearCompanyOverride: (id) =>
        set((s) => {
          const rest = { ...s.companyOverrides };
          delete rest[id];
          return { companyOverrides: rest, ...touch(s) };
        }),
      importCompanies: (companies, source) => {
        const stamped = companies.map((c) => ({
          ...c,
          source,
          political: { ...c.political, provenance: 'imported' as const },
          ratingsProvenance: 'imported' as const,
          fictional: false,
        }));
        set((s) => {
          const byId = new Map(s.importedCompanies.map((c) => [c.id, c]));
          for (const c of stamped) byId.set(c.id, c);
          return { importedCompanies: [...byId.values()], ...touch(s) };
        });
        return stamped.length;
      },

      setBucketDefault: (bucket, principleId, value) =>
        set((s) => ({
          bucketDefaults: {
            ...s.bucketDefaults,
            [bucket]: {
              ...s.bucketDefaults[bucket],
              [principleId]: Math.max(-2, Math.min(2, value)),
            },
          },
          ...touch(s),
        })),
      resetBucketDefaults: () =>
        set((s) => ({
          bucketDefaults: JSON.parse(JSON.stringify(DEFAULT_BUCKET_RATINGS)),
          ...touch(s),
        })),

      setGates: (gates) =>
        set((s) => ({ gates: gates.map((g) => ({ ...g })), placements: {}, ...touch(s) })),
      updateGate: (id, patch) =>
        set((s) => ({
          gates: s.gates.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          ...touch(s),
        })),
      addGate: () =>
        set((s) => {
          const n = s.gates.length + 1;
          return {
            gates: [...s.gates, { id: uid('g'), label: `Gate ${n}`, effortBudget: 8 }],
            ...touch(s),
          };
        }),
      removeGate: (id) =>
        set((s) => {
          const placements = Object.fromEntries(
            Object.entries(s.placements).filter(([, g]) => g !== id),
          );
          return { gates: s.gates.filter((g) => g.id !== id), placements, ...touch(s) };
        }),
      placeAction: (swapId, gateId) =>
        set((s) => {
          const placements = { ...s.placements };
          if (gateId) placements[swapId] = gateId;
          else delete placements[swapId];
          return { placements, ...touch(s) };
        }),
      dismissAction: (swapId) =>
        set((s) =>
          s.dismissed.includes(swapId) ? {} : { dismissed: [...s.dismissed, swapId], ...touch(s) },
        ),
      restoreAction: (swapId) =>
        set((s) => ({ dismissed: s.dismissed.filter((x) => x !== swapId), ...touch(s) })),
      clearPlanEdits: () =>
        set((s) => ({
          placements: {},
          dismissed: [],
          gates: DEFAULT_GATES.map((g) => ({ ...g })),
          ...touch(s),
        })),

      setWizardStep: (step) =>
        set((s) => ({
          wizard: { ...s.wizard, step: Math.max(1, Math.min(7, Math.round(step))) } as WizardMeta,
        })),
      completeWizard: () =>
        set((s) => ({ wizard: { ...s.wizard, completed: true, step: 7 }, ...touch(s) })),

      loadState: (state) => set(() => ({ ...state })),
      resetAll: () => set(() => ({ ...initialState() })),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => pickState(s),
      migrate: (persisted, version) => {
        const migrated = migrateState(persisted, version);
        const r = normalizeState(migrated);
        // On any structural problem, fall back to a fresh state rather than crash the app.
        return r.ok ? r.state : initialState();
      },
      merge: (persisted, current) => {
        const r = normalizeState(persisted);
        return r.ok ? { ...current, ...r.state } : current;
      },
    },
  ),
);

/** Non-hook access for tests / dev tools. */
export const compassStore = useCompassStore;
