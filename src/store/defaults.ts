import type { CompassState } from './schema';
import { SCHEMA_VERSION } from './schema';
import { DEFAULT_BUCKET_RATINGS } from '@/data/bucketDefaults';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { PRINCIPLE_LIBRARY, libraryPrinciple } from '@/data/principles';
import { defaultCategories } from '@/data/categories.defaults';
import { DEFAULT_GATES } from '@/engine/plan';
import type { GoalMode, Principle } from '@/engine/types';

/** Principles for a goal mode: every library principle, weights from the preset (unlisted → 0). */
export function principlesForMode(
  mode: GoalMode,
  existing: readonly Principle[] = [],
): Principle[] {
  const preset = GOAL_MODE_PRESETS[mode];
  if (mode === 'custom') return existing.length ? [...existing] : principlesForMode('local-first');
  const custom = existing.filter((p) => p.custom);
  const lib = PRINCIPLE_LIBRARY.map((d) => libraryPrinciple(d.id, preset.weights[d.id] ?? 0));
  return [...lib, ...custom];
}

export function initialState(now = new Date().toISOString()): CompassState {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { name: '', createdAt: now, updatedAt: now },
    goalMode: 'local-first',
    principles: principlesForMode('local-first'),
    political: { configured: false, direction: 0, intensity: 0.5 },
    categories: defaultCategories(),
    holdings: [],
    userCompanies: [],
    importedCompanies: [],
    companyOverrides: {},
    bucketDefaults: JSON.parse(JSON.stringify(DEFAULT_BUCKET_RATINGS)),
    gates: DEFAULT_GATES.map((g) => ({ ...g })),
    placements: {},
    dismissed: [],
    wizard: { step: 1, completed: false, targetsCustomized: false },
  };
}
