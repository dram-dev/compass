import { SCHEMA_VERSION, type CompassState } from './schema';

/**
 * Migration scaffold (spec §12). Each entry upgrades from `from` to `from + 1`.
 * v1 is the first schema, so the only migration is a no-op placeholder that documents the pattern.
 */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release states are treated as v1 (no-op).
  0: (s) => ({ ...s, schemaVersion: 1 }),
};

export class MigrationError extends Error {}

/** Upgrade a raw persisted object from `fromVersion` to SCHEMA_VERSION. Throws MigrationError. */
export function migrateState(raw: unknown, fromVersion: number): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new MigrationError('Persisted state is not an object.');
  }
  if (fromVersion > SCHEMA_VERSION) {
    throw new MigrationError(
      `This file was saved by a newer Compass (schema v${fromVersion}); this build reads v${SCHEMA_VERSION}.`,
    );
  }
  let state = { ...(raw as Record<string, unknown>) };
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new MigrationError(`No migration path from schema v${v}.`);
    state = m(state);
  }
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}

export function versionOf(raw: unknown): number {
  if (typeof raw === 'object' && raw !== null && 'schemaVersion' in raw) {
    const v = (raw as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  }
  return 0;
}

export type { CompassState };
