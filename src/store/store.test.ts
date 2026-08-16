import { beforeEach, describe, expect, it } from 'vitest';
import { useCompassStore } from './useCompassStore';
import { loadJordan } from '@/data/fixtures/jordan';
import { computeScores } from './scoring';
import { exportState, importState, pickState } from './persistence';
import { normalizeState, parseImport } from './validate';
import { migrateState, MigrationError } from './migrations';
import { round1 } from '@/engine';
import { STORAGE_KEY } from './schema';

beforeEach(() => {
  localStorage.clear();
  useCompassStore.getState().resetAll();
});

describe('store: goal mode + principles', () => {
  it('setGoalMode re-weights library principles and keeps custom ones', () => {
    const s = useCompassStore.getState();
    s.addCustomPrinciple('Bike friendliness', 30);
    s.setGoalMode('political-alignment');
    const p = useCompassStore.getState().principles;
    expect(p.find((x) => x.id === 'political-alignment')!.weight).toBe(60);
    expect(p.find((x) => x.id === 'local-economy')!.weight).toBe(15);
    expect(p.find((x) => x.id === 'privacy')!.weight).toBe(0);
    expect(p.find((x) => x.custom)!.weight).toBe(30);
    s.setGoalMode('custom');
    expect(useCompassStore.getState().principles).toEqual(p);
  });

  it('setGoalMode applies target presets only until targets are customized', () => {
    const s = useCompassStore.getState();
    s.loadState({
      ...loadJordan(),
      wizard: { step: 6, completed: false, targetsCustomized: false },
    });
    const before = useCompassStore.getState().categories[0]!.target;
    s.setGoalMode('divest-redirect');
    const after = useCompassStore.getState().categories[0]!.target;
    expect(after).not.toEqual(before);
    s.setRange('groceries', 'target', 'local', [70, 80]);
    expect(useCompassStore.getState().wizard.targetsCustomized).toBe(true);
    const custom = useCompassStore.getState().categories[0]!.target;
    s.setGoalMode('local-first');
    expect(useCompassStore.getState().categories[0]!.target).toEqual(custom);
    s.applyTargetPreset();
    expect(useCompassStore.getState().wizard.targetsCustomized).toBe(false);
    expect(useCompassStore.getState().categories[0]!.target).not.toEqual(custom);
  });
});

describe('store: categories, companies, holdings, plan edits', () => {
  it('category CRUD and range clamping', () => {
    const s = useCompassStore.getState();
    const id = s.addCategory('Pets');
    s.setCategorySpend(id, -20);
    expect(useCompassStore.getState().categories.find((c) => c.id === id)!.monthlySpend).toBe(0);
    s.setCategorySpend(id, 120);
    s.setRange(id, 'current', 'local', [110, -5]);
    const cat = useCompassStore.getState().categories.find((c) => c.id === id)!;
    expect(cat.current.find((a) => a.bucket === 'local')!.rangePct).toEqual([0, 100]);
    s.renameCategory(id, 'Pet care');
    expect(useCompassStore.getState().categories.find((c) => c.id === id)!.label).toBe('Pet care');
    s.removeCategory(id);
    expect(useCompassStore.getState().categories.some((c) => c.id === id)).toBe(false);
  });

  it('named companies + user companies + overrides', () => {
    const s = useCompassStore.getState();
    const c = s.addUserCompany('Corner Deli', 'local');
    expect(c.ratingsProvenance).toBe('user');
    expect(s.addUserCompany('corner deli', 'local').id).toBe(c.id); // dedupe by name
    s.addNamedCompany('groceries', 'current', 'local', c.id);
    s.addNamedCompany('groceries', 'current', 'local', c.id); // idempotent
    let g = useCompassStore.getState().categories.find((x) => x.id === 'groceries')!;
    expect(g.current.find((a) => a.bucket === 'local')!.namedCompanyIds).toEqual([c.id]);
    s.setCompanyOverride(c.id, { ratings: { labor: 2 } });
    s.setCompanyOverride(c.id, { political: { leanScore: 1 } });
    expect(useCompassStore.getState().companyOverrides[c.id]).toEqual({
      ratings: { labor: 2 },
      political: { leanScore: 1 },
    });
    s.clearCompanyOverride(c.id);
    expect(useCompassStore.getState().companyOverrides[c.id]).toBeUndefined();
    s.removeNamedCompany('groceries', 'current', 'local', c.id);
    g = useCompassStore.getState().categories.find((x) => x.id === 'groceries')!;
    expect(g.current.find((a) => a.bucket === 'local')!.namedCompanyIds).toEqual([]);
    const n = s.importCompanies([{ ...c, id: 'imp-1', name: 'Imported Co' }], 'Test pack');
    expect(n).toBe(1);
    expect(useCompassStore.getState().importedCompanies[0]!.political.provenance).toBe('imported');
  });

  it('holdings CRUD, gates and plan edits', () => {
    const s = useCompassStore.getState();
    const id = s.addHolding({ label: 'Savings', type: 'cash', amount: 100 });
    s.updateHolding(id, { amount: 250 });
    expect(useCompassStore.getState().holdings[0]!.amount).toBe(250);
    s.removeHolding(id);
    expect(useCompassStore.getState().holdings).toHaveLength(0);
    s.addGate();
    expect(useCompassStore.getState().gates).toHaveLength(4);
    s.updateGate('g1', { effortBudget: 3, label: 'Week 2' });
    expect(useCompassStore.getState().gates[0]).toMatchObject({ effortBudget: 3, label: 'Week 2' });
    s.placeAction('x', 'g2');
    s.removeGate('g2');
    expect(useCompassStore.getState().placements).toEqual({});
    s.placeAction('y', 'g1');
    s.placeAction('y', null);
    expect(useCompassStore.getState().placements).toEqual({});
    s.dismissAction('z');
    s.dismissAction('z');
    expect(useCompassStore.getState().dismissed).toEqual(['z']);
    s.restoreAction('z');
    expect(useCompassStore.getState().dismissed).toEqual([]);
    s.clearPlanEdits();
    expect(useCompassStore.getState().gates).toHaveLength(3);
    s.setBucketDefault('local', 'labor', 5);
    expect(useCompassStore.getState().bucketDefaults.local.labor).toBe(2);
    s.resetBucketDefaults();
    expect(useCompassStore.getState().bucketDefaults.local.labor).toBe(1);
    s.setWizardStep(99);
    expect(useCompassStore.getState().wizard.step).toBe(7);
    s.completeWizard();
    expect(useCompassStore.getState().wizard.completed).toBe(true);
  });
});

describe('scoring + persistence', () => {
  it('computeScores on Jordan is fast and matches ground truth', () => {
    const scores = computeScores(loadJordan());
    expect(round1(scores.current.index)).toBe(42.0);
    expect(round1(scores.target.index)).toBe(58.9);
    expect(scores.computeMs).toBeLessThan(100);
    expect(scores.plan.gates).toHaveLength(3);
    expect(scores.trajectory).toHaveLength(4);
    expect(scores.investments.total).toBe(86000);
  });

  it('export → clear → import restores identical state', () => {
    const s = useCompassStore.getState();
    s.loadState(loadJordan());
    const before = pickState(useCompassStore.getState());
    const json = exportState(before);
    localStorage.clear();
    s.resetAll();
    expect(useCompassStore.getState().categories[0]!.monthlySpend).toBe(0);
    const r = importState(json);
    expect(r.ok).toBe(true);
    if (r.ok) s.loadState(r.state);
    expect(pickState(useCompassStore.getState())).toEqual(before);
    // persisted under the versioned key
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.version).toBe(1);
    expect(raw.state.schemaVersion).toBe(1);
  });

  it('malformed imports fail with specific errors, never throw', () => {
    expect(parseImport('{')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Not valid JSON/),
    });
    expect(parseImport('[]')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/top level/),
    });
    expect(parseImport('{"schemaVersion":99}')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/newer Compass/),
    });
    const j = loadJordan() as unknown as Record<string, unknown>;
    expect(normalizeState({ ...j, goalMode: 'zzz' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/goalMode/),
    });
    expect(normalizeState({ ...j, principles: [] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/principles/),
    });
    expect(normalizeState({ ...j, political: { configured: true, direction: 5 } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/direction/),
    });
    expect(
      normalizeState({ ...j, categories: [{ id: 'a', label: 'A', monthlySpend: -1 }] }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/monthlySpend/) });
    expect(
      normalizeState({
        ...j,
        categories: [
          { id: 'a', label: 'A', monthlySpend: 1, current: [{ bucket: 'zz' }], target: [] },
        ],
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/invalid bucket/) });
    expect(
      normalizeState({
        ...j,
        categories: [
          {
            id: 'a',
            label: 'A',
            monthlySpend: 1,
            current: [{ bucket: 'local', rangePct: [1] }],
            target: [],
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/rangePct/) });
    expect(normalizeState({ ...j, categories: [] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at least one/),
    });
    expect(normalizeState({ ...j, holdings: [{}] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/holdings/),
    });
    expect(normalizeState({ ...j, gates: [{}] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/gates/),
    });
    // missing optional sections are filled with defaults; unversioned = v0 → migrated
    const min = {
      goalMode: 'custom',
      principles: [{ id: 'a', label: 'A', weight: 1 }],
      political: { configured: false, direction: 0 },
      categories: j.categories,
    };
    const r = normalizeState(min);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.schemaVersion).toBe(1);
      expect(r.state.gates).toHaveLength(3);
      expect(r.state.wizard.step).toBe(1);
      expect(r.state.political.intensity).toBe(0.5);
    }
  });

  it('migrateState guards', () => {
    expect(() => migrateState(null, 0)).toThrow(MigrationError);
    expect(() => migrateState({}, 5)).toThrow(/newer/);
    expect(migrateState({ a: 1 }, 0)).toEqual({ a: 1, schemaVersion: 1 });
    expect(migrateState({ a: 1, schemaVersion: 1 }, 1)).toEqual({ a: 1, schemaVersion: 1 });
  });
});
