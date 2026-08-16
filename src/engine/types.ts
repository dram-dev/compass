/**
 * Data model — spec §5, implemented exactly; extensions are additive and marked `// ext`.
 */

export type Provenance = 'sample' | 'user' | 'imported';
export type BucketId = 'local' | 'regional' | 'major' | 'unknown';

export const BUCKET_IDS: readonly BucketId[] = ['local', 'regional', 'major', 'unknown'] as const;

export const BUCKET_LABELS: Record<BucketId, string> = {
  local: 'Local independent',
  regional: 'Regional chain',
  major: 'Major corporation',
  unknown: 'Unknown / other',
};

export interface Principle {
  id: string;
  label: string;
  weight: number; // 0–100, normalized at scoring time
  custom: boolean;
  description?: string; // ext: one-line helper copy from the library
}

export interface PoliticalProfile {
  leanScore: number | null; // -2..+2 on a conventional US party axis; null = unknown
  confidence: 'low' | 'med' | 'high';
  sourceHint: string;
  provenance: Provenance;
}

export interface Company {
  id: string;
  name: string;
  parentCompanyId?: string;
  sector: string;
  bucketDefault: BucketId;
  political: PoliticalProfile;
  ratings: Record<string, number>; // principleId -> -2..+2 (missing → bucket default)
  ratingsProvenance: Provenance;
  fictional?: boolean; // ext: true for illustrative archetypes (never real brands)
  source?: string; // ext: source string for imported data packs
}

export interface BucketAllocation {
  bucket: BucketId;
  rangePct: [number, number];
  namedCompanyIds: string[];
}

export interface SpendCategory {
  id: string;
  label: string;
  monthlySpend: number;
  current: BucketAllocation[];
  target: BucketAllocation[];
}

export type HoldingType = 'cash' | 'equity' | 'fund' | 'crypto' | 'other';

/** ext: sleeves for the investments flow diagram (spec §3.6). */
export type SleeveId = 'cash' | 'retirement' | 'equities' | 'community' | 'alternatives';

/** ext: investment buckets on the right side of the investments sankey (spec §8.2). */
export type InvestmentBucketId =
  'community-aligned' | 'broad-mixed' | 'major-concentrated' | 'unknown-unrated';

export interface Holding {
  id: string;
  label: string;
  type: HoldingType;
  amount: number;
  ratings: Record<string, number>;
  political: PoliticalProfile | null;
  sleeve?: SleeveId; // ext: override of the type→sleeve mapping
  targetBucket?: InvestmentBucketId | null; // ext: user-defined "optimal" bucket for this holding
  companyId?: string; // ext: optional dataset match (ratings then default from that company)
}

export type GoalMode =
  'local-first' | 'political-alignment' | 'cost-conscious' | 'divest-redirect' | 'custom';

export const GOAL_MODES: readonly GoalMode[] = [
  'local-first',
  'political-alignment',
  'cost-conscious',
  'divest-redirect',
  'custom',
] as const;

export interface UserPoliticalPreference {
  configured: boolean;
  direction: -1 | 1 | 0;
  intensity: number; // 0–1
}

export type CostDelta = 'saves' | 'neutral' | 'small' | 'moderate';
export type Effort = 1 | 2 | 3 | 4 | 5;

export interface SwapAction {
  id: string;
  categoryId: string;
  description: string;
  deltaIndexPoints: number;
  effort: Effort;
  costDelta: CostDelta;
  freeWin: boolean;
  gateId: string | null;
  // ext — derived detail used by visuals and the print view
  fromBucket: BucketId;
  toBucket: BucketId;
  shiftPct: number; // percentage points of the category moved
  dollarsPerMonth: number; // dollars affected per month
  priority: number; // deltaIndexPoints / effort
  localShift: boolean; // true when money moves toward the local bucket (multiplier note)
}

export interface StageGate {
  id: string;
  label: string;
  effortBudget: number; // default 8
  actions: string[]; // SwapAction ids
  projectedIndex: number;
  effortUsed?: number; // ext
}

/** ext: bucket-default ratings, user-editable (spec §6.2). */
export type BucketDefaults = Record<BucketId, Record<string, number>>;

/** Principle id reserved for the derived political-alignment rating (spec §6.4 + ASSUMPTIONS #2). */
export const POLITICAL_PRINCIPLE_ID = 'political-alignment';

/** Alignment classes used in every political display (orientation-neutral). */
export type PoliticalClass = 'aligned' | 'mixed' | 'opposed' | 'unknown';
export const POLITICAL_CLASSES: readonly PoliticalClass[] = [
  'aligned',
  'mixed',
  'opposed',
  'unknown',
] as const;
