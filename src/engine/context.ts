import type { BucketDefaults, Company, Principle, UserPoliticalPreference } from './types';
import { normalizeWeights } from './normalize';

/** Everything the pure engine needs to score; built once per store change. */
export interface ScoringContext {
  weights: Record<string, number>; // normalized §6.1
  principleIds: string[];
  bucketDefaults: BucketDefaults;
  companies: Record<string, Company>; // resolved: overrides already applied
  political: UserPoliticalPreference;
}

export interface ContextInput {
  principles: readonly Principle[];
  bucketDefaults: BucketDefaults;
  companies: readonly Company[];
  political: UserPoliticalPreference;
}

export function buildContext(input: ContextInput): ScoringContext {
  const companies: Record<string, Company> = {};
  for (const c of input.companies) companies[c.id] = c;
  return {
    weights: normalizeWeights(input.principles),
    principleIds: input.principles.map((p) => p.id),
    bucketDefaults: input.bucketDefaults,
    companies,
    political: input.political,
  };
}

export const UNCONFIGURED_POLITICAL: UserPoliticalPreference = {
  configured: false,
  direction: 0,
  intensity: 0,
};
