import type { BucketDefaults } from '@/engine/types';

/**
 * Bucket-default principle ratings (spec §6.2) — used for any bucket portion without a rated,
 * named company. User-editable in the Advanced panel; the store keeps overrides.
 *
 * Ground truth (§6.5): local {Local:+2, Labor:+1}, major {Local:−2, Labor:−1}, regional/unknown 0.
 * `political-alignment` defaults to 0 for every bucket — no bucket is presumed to lean anywhere
 * (ASSUMPTIONS #2). Missing principle ids (custom principles) read as 0.
 */
export const DEFAULT_BUCKET_RATINGS: BucketDefaults = {
  local: {
    'local-economy': 2,
    labor: 1,
    environment: 1,
    'political-alignment': 0,
    'domestic-manufacturing': 1,
    privacy: 1,
    'animal-welfare': 0,
  },
  regional: {
    'local-economy': 0,
    labor: 0,
    environment: 0,
    'political-alignment': 0,
    'domestic-manufacturing': 0,
    privacy: 0,
    'animal-welfare': 0,
  },
  major: {
    'local-economy': -2,
    labor: -1,
    environment: -1,
    'political-alignment': 0,
    'domestic-manufacturing': -1,
    privacy: -1,
    'animal-welfare': 0,
  },
  unknown: {
    'local-economy': 0,
    labor: 0,
    environment: 0,
    'political-alignment': 0,
    'domestic-manufacturing': 0,
    privacy: 0,
    'animal-welfare': 0,
  },
};
