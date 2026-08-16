import type {
  BucketDefaults,
  BucketId,
  Company,
  GoalMode,
  Holding,
  PoliticalProfile,
  Principle,
  SpendCategory,
  UserPoliticalPreference,
} from '@/engine/types';
import type { GateConfig } from '@/engine/plan';

export const SCHEMA_VERSION = 1 as const;
export const STORAGE_KEY = 'compass.v1';

/** User edits to a company (any provenance) — stored separately and win everywhere (§10.3). */
export interface CompanyOverride {
  ratings?: Record<string, number>;
  political?: Partial<PoliticalProfile>;
  bucketDefault?: BucketId;
  name?: string;
}

export interface WizardMeta {
  step: number; // 1..7
  completed: boolean;
  /** true once the user has edited any target range — mode switches then stop rewriting targets. */
  targetsCustomized: boolean;
}

/** Persisted user state — the exact shape of JSON export/import and the Jordan fixture. */
export interface CompassStateV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  profile: { name: string; createdAt: string; updatedAt: string };
  goalMode: GoalMode;
  principles: Principle[];
  political: UserPoliticalPreference;
  categories: SpendCategory[];
  holdings: Holding[];
  userCompanies: Company[]; // provenance 'user'
  importedCompanies: Company[]; // provenance 'imported'
  companyOverrides: Record<string, CompanyOverride>;
  bucketDefaults: BucketDefaults;
  gates: GateConfig[];
  placements: Record<string, string>; // swapId -> gateId (manual drag)
  dismissed: string[]; // swapId[]
  wizard: WizardMeta;
}

export type CompassState = CompassStateV1;
