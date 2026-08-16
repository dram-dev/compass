import type { CompassState } from '@/store/schema';
import raw from './persona-jordan.json';

/** Jordan — the test persona (spec §12). Deep-cloned on each call so callers can mutate. */
export function loadJordan(): CompassState {
  return JSON.parse(JSON.stringify(raw)) as CompassState;
}
