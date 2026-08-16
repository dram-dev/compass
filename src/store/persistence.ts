import type { CompassState } from './schema';
import { STORAGE_KEY } from './schema';
import { parseImport, type ImportResult } from './validate';

export const EXPORT_KEYS: (keyof CompassState)[] = [
  'schemaVersion',
  'profile',
  'goalMode',
  'principles',
  'political',
  'categories',
  'holdings',
  'userCompanies',
  'importedCompanies',
  'companyOverrides',
  'bucketDefaults',
  'gates',
  'placements',
  'dismissed',
  'wizard',
];

/** Extract only the persisted slice from a store snapshot (drops actions). */
export function pickState<T extends CompassState>(full: T): CompassState {
  const out = {} as Record<string, unknown>;
  for (const k of EXPORT_KEYS) out[k] = full[k];
  return out as unknown as CompassState;
}

export function exportState(state: CompassState, pretty = true): string {
  return JSON.stringify(pickState(state), null, pretty ? 2 : 0);
}

export function importState(text: string): ImportResult {
  return parseImport(text);
}

export function exportFilename(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `compass-export-${d}.json`;
}

/** Trigger a browser download of the current state (user-initiated). */
export function downloadJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function clearPersistedStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
