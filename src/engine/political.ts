import type {
  Company,
  PoliticalClass,
  Provenance,
  SpendCategory,
  UserPoliticalPreference,
} from './types';
import { BUCKET_IDS } from './types';
import type { ScoringContext } from './context';
import { midpoints } from './allocation';
import type { Which } from './score';

/** §6.4 — relative = leanScore × direction → Aligned (≥ +1), Mixed (−1 < r < +1), Opposed (≤ −1). */
export function classifyLean(
  leanScore: number | null | undefined,
  pref: UserPoliticalPreference,
): PoliticalClass {
  if (!pref.configured || pref.direction === 0) return 'unknown';
  if (leanScore === null || leanScore === undefined || Number.isNaN(leanScore)) return 'unknown';
  const rel = leanScore * pref.direction;
  if (rel >= 1) return 'aligned';
  if (rel <= -1) return 'opposed';
  return 'mixed';
}

export interface PoliticalContributor {
  companyId: string;
  name: string;
  parentName: string | null;
  parentId: string | null;
  categoryId: string;
  categoryLabel: string;
  dollars: number;
  cls: PoliticalClass;
  leanScore: number | null;
  provenance: Provenance;
  fictional: boolean;
  sourceHint: string;
}

export interface PoliticalExposure {
  configured: boolean;
  totalSpend: number;
  dollars: Record<PoliticalClass, number>;
  shares: Record<PoliticalClass, number>; // % of total monthly spend (sums to 100)
  contributors: PoliticalContributor[]; // assessed portions only, sorted by dollars desc
  unassessedShare: number; // == shares.unknown
}

export function resolveParent(company: Company, ctx: ScoringContext): Company | null {
  if (!company.parentCompanyId) return null;
  return ctx.companies[company.parentCompanyId] ?? null;
}

const EMPTY = (): Record<PoliticalClass, number> => ({
  aligned: 0,
  mixed: 0,
  opposed: 0,
  unknown: 0,
});

/**
 * §6.4 — political exposure by class, in dollars and % of monthly discretionary spend.
 * Named companies split their bucket's dollars equally; unnamed bucket portions and the unknown
 * bucket are Unknown. Unknown is never redistributed.
 */
export function politicalExposure(
  categories: readonly SpendCategory[],
  which: Which,
  ctx: ScoringContext,
): PoliticalExposure {
  const dollars = EMPTY();
  const contributors: PoliticalContributor[] = [];
  let totalSpend = 0;
  const configured = ctx.political.configured && ctx.political.direction !== 0;

  for (const cat of categories) {
    const spend = Math.max(0, cat.monthlySpend || 0);
    totalSpend += spend;
    if (spend <= 0) continue;
    const shares = midpoints(cat[which]);
    for (const b of BUCKET_IDS) {
      const bucketDollars = (shares[b] / 100) * spend;
      if (bucketDollars <= 0) continue;
      const alloc = cat[which].find((a) => a.bucket === b);
      const named = (alloc?.namedCompanyIds ?? [])
        .map((id) => ctx.companies[id])
        .filter((c): c is Company => !!c);
      if (b === 'unknown' || named.length === 0 || !configured) {
        dollars.unknown += bucketDollars;
        continue;
      }
      const each = bucketDollars / named.length;
      for (const c of named) {
        const cls = classifyLean(c.political.leanScore, ctx.political);
        dollars[cls] += each;
        if (cls !== 'unknown') {
          const parent = resolveParent(c, ctx);
          contributors.push({
            companyId: c.id,
            name: c.name,
            parentName: parent?.name ?? null,
            parentId: parent?.id ?? null,
            categoryId: cat.id,
            categoryLabel: cat.label,
            dollars: each,
            cls,
            leanScore: c.political.leanScore,
            provenance: c.political.provenance,
            fictional: !!c.fictional,
            sourceHint: c.political.sourceHint,
          });
        }
      }
    }
  }
  const shares = EMPTY();
  if (totalSpend > 0) {
    for (const k of Object.keys(shares) as PoliticalClass[])
      shares[k] = (dollars[k] / totalSpend) * 100;
  } else {
    shares.unknown = 100;
  }
  contributors.sort((a, b) => b.dollars - a.dollars);
  return { configured, totalSpend, dollars, shares, contributors, unassessedShare: shares.unknown };
}
