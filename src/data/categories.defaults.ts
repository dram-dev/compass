import type { BucketId, SpendCategory } from '@/engine/types';
import { midpointsToRanges } from './goalModePresets';

export interface DefaultCategoryDef {
  id: string;
  label: string;
  optional?: boolean;
  /** Keywords used by the heuristics table to recognize renamed/custom categories. */
  keywords: string[];
}

/** Spec §5 default category labels. */
export const DEFAULT_CATEGORIES: DefaultCategoryDef[] = [
  { id: 'groceries', label: 'Groceries', keywords: ['grocer', 'food', 'market', 'co-op', 'coop'] },
  {
    id: 'dining',
    label: 'Dining & coffee',
    keywords: ['dining', 'coffee', 'restaurant', 'cafe', 'café', 'takeout'],
  },
  { id: 'fuel', label: 'Fuel & auto', keywords: ['fuel', 'gas', 'auto', 'car', 'petrol'] },
  {
    id: 'retail',
    label: 'Retail & household',
    keywords: ['retail', 'household', 'shopping', 'clothes', 'apparel'],
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions & media',
    keywords: ['subscription', 'media', 'streaming', 'stream', 'app', 'phone', 'internet'],
  },
  {
    id: 'banking',
    label: 'Banking & insurance',
    keywords: ['bank', 'insurance', 'credit', 'loan', 'mortgage', 'finance'],
  },
  {
    id: 'personal-care',
    label: 'Personal care & services',
    keywords: ['personal', 'care', 'salon', 'gym', 'fitness', 'barber', 'services'],
  },
  {
    id: 'home',
    label: 'Home improvement',
    keywords: ['home', 'improvement', 'hardware', 'contractor', 'repair', 'garden'],
  },
  {
    id: 'charitable',
    label: 'Charitable giving',
    optional: true,
    keywords: ['charit', 'giving', 'donat', 'nonprofit', 'church', 'tithe'],
  },
];

const EVEN: Record<BucketId, number> = { local: 25, regional: 25, major: 25, unknown: 25 };

export function blankCategory(id: string, label: string, monthlySpend = 0): SpendCategory {
  return {
    id,
    label,
    monthlySpend,
    current: midpointsToRanges(EVEN, 10),
    target: midpointsToRanges(EVEN, 10),
  };
}

export function defaultCategories(): SpendCategory[] {
  return DEFAULT_CATEGORIES.filter((c) => !c.optional).map((c) => blankCategory(c.id, c.label, 0));
}
