import type { CompassState } from './schema';
import { SCHEMA_VERSION } from './schema';
import { initialState } from './defaults';
import { migrateState, MigrationError, versionOf } from './migrations';
import { BUCKET_IDS, GOAL_MODES } from '@/engine/types';
import type { BucketAllocation, BucketId, SpendCategory } from '@/engine/types';
import { completeAllocations } from '@/engine/allocation';

export type ImportResult = { ok: true; state: CompassState } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function fail(msg: string): ImportResult {
  return { ok: false, error: msg };
}

function checkAllocs(v: unknown, where: string): BucketAllocation[] {
  if (!Array.isArray(v)) throw new Error(`${where}: expected an array of bucket allocations.`);
  const out: BucketAllocation[] = [];
  for (const a of v) {
    if (!isObj(a) || !BUCKET_IDS.includes(a.bucket as BucketId))
      throw new Error(
        `${where}: allocation has an invalid bucket (${String((a as { bucket?: unknown })?.bucket)}).`,
      );
    const r = a.rangePct;
    if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1]))
      throw new Error(`${where}: rangePct must be [min, max] numbers.`);
    const lo = Math.max(0, Math.min(100, Math.min(r[0], r[1])));
    const hi = Math.max(0, Math.min(100, Math.max(r[0], r[1])));
    const named = Array.isArray(a.namedCompanyIds) ? a.namedCompanyIds.filter(isStr) : [];
    out.push({ bucket: a.bucket as BucketId, rangePct: [lo, hi], namedCompanyIds: named });
  }
  return completeAllocations(out);
}

function checkCategories(v: unknown): SpendCategory[] {
  if (!Array.isArray(v)) throw new Error('categories: expected an array.');
  return v.map((c, i) => {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.label))
      throw new Error(`categories[${i}]: needs string id and label.`);
    if (!isNum(c.monthlySpend) || c.monthlySpend < 0)
      throw new Error(`categories[${i}] (${c.label}): monthlySpend must be a non-negative number.`);
    return {
      id: c.id,
      label: c.label,
      monthlySpend: c.monthlySpend,
      current: checkAllocs(c.current, `categories[${i}].current`),
      target: checkAllocs(c.target, `categories[${i}].target`),
    };
  });
}

/**
 * Validate + normalize a raw object into a CompassState. Fills missing optional sections with
 * defaults; rejects anything structurally wrong with a specific message (never a partial load).
 */
export function normalizeState(raw: unknown): ImportResult {
  try {
    if (!isObj(raw)) return fail('Not a Compass export: top level must be a JSON object.');
    const version = versionOf(raw);
    const s = migrateState(raw, version);
    const base = initialState();

    if (!isStr(s.goalMode) || !GOAL_MODES.includes(s.goalMode as (typeof GOAL_MODES)[number]))
      return fail(`goalMode must be one of ${GOAL_MODES.join(', ')}.`);
    if (!Array.isArray(s.principles) || s.principles.length === 0)
      return fail('principles: expected a non-empty array.');
    for (const p of s.principles as unknown[]) {
      if (!isObj(p) || !isStr(p.id) || !isStr(p.label) || !isNum(p.weight))
        return fail('principles: each needs id, label and numeric weight.');
    }
    if (!isObj(s.political) || typeof s.political.configured !== 'boolean')
      return fail('political: expected { configured, direction, intensity }.');
    const dir = s.political.direction;
    if (dir !== -1 && dir !== 0 && dir !== 1)
      return fail('political.direction must be -1, 0 or 1.');
    const categories = checkCategories(s.categories);
    if (categories.length === 0) return fail('categories: at least one category is required.');

    const holdings = Array.isArray(s.holdings) ? s.holdings : [];
    for (const h of holdings as unknown[]) {
      if (!isObj(h) || !isStr(h.id) || !isStr(h.label) || !isNum(h.amount))
        return fail('holdings: each needs id, label and numeric amount.');
    }
    const gatesRaw = Array.isArray(s.gates) && s.gates.length ? s.gates : base.gates;
    for (const g of gatesRaw as unknown[]) {
      if (!isObj(g) || !isStr(g.id) || !isStr(g.label) || !isNum(g.effortBudget))
        return fail('gates: each needs id, label and numeric effortBudget.');
    }

    const state: CompassState = {
      schemaVersion: SCHEMA_VERSION,
      profile: isObj(s.profile)
        ? {
            name: isStr(s.profile.name) ? s.profile.name : '',
            createdAt: isStr(s.profile.createdAt) ? s.profile.createdAt : base.profile.createdAt,
            updatedAt: isStr(s.profile.updatedAt) ? s.profile.updatedAt : base.profile.updatedAt,
          }
        : base.profile,
      goalMode: s.goalMode as CompassState['goalMode'],
      principles: (s.principles as CompassState['principles']).map((p) => ({
        id: p.id,
        label: p.label,
        weight: Math.max(0, Math.min(100, p.weight)),
        custom: !!p.custom,
        ...(p.description ? { description: p.description } : {}),
      })),
      political: {
        configured: s.political.configured as boolean,
        direction: dir,
        intensity: isNum(s.political.intensity)
          ? Math.max(0, Math.min(1, s.political.intensity))
          : 0.5,
      },
      categories,
      holdings: holdings as CompassState['holdings'],
      userCompanies: Array.isArray(s.userCompanies)
        ? (s.userCompanies as CompassState['userCompanies'])
        : [],
      importedCompanies: Array.isArray(s.importedCompanies)
        ? (s.importedCompanies as CompassState['importedCompanies'])
        : [],
      companyOverrides: isObj(s.companyOverrides)
        ? (s.companyOverrides as CompassState['companyOverrides'])
        : {},
      bucketDefaults: isObj(s.bucketDefaults)
        ? { ...base.bucketDefaults, ...(s.bucketDefaults as CompassState['bucketDefaults']) }
        : base.bucketDefaults,
      gates: gatesRaw as CompassState['gates'],
      placements: isObj(s.placements) ? (s.placements as CompassState['placements']) : {},
      dismissed: Array.isArray(s.dismissed) ? (s.dismissed as string[]).filter(isStr) : [],
      wizard: isObj(s.wizard)
        ? {
            step: isNum(s.wizard.step) ? Math.max(1, Math.min(7, Math.round(s.wizard.step))) : 1,
            completed: !!s.wizard.completed,
            targetsCustomized: !!s.wizard.targetsCustomized,
          }
        : base.wizard,
    };
    return { ok: true, state };
  } catch (e) {
    if (e instanceof MigrationError) return fail(e.message);
    return fail(e instanceof Error ? e.message : 'Unknown validation error.');
  }
}

/** Parse JSON text and validate. Never throws. */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return fail(`Not valid JSON: ${e instanceof Error ? e.message : 'parse error'}.`);
  }
  return normalizeState(raw);
}
