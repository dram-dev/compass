import type { Company, PoliticalProfile } from './types';

/** User edits to a company — stored separately, provenance 'user', win everywhere (§10.3). */
export interface CompanyOverrideInput {
  ratings?: Record<string, number>;
  political?: Partial<PoliticalProfile>;
  bucketDefault?: Company['bucketDefault'];
  name?: string;
}

/**
 * Merge sample + imported + user companies and apply user overrides.
 * Later sources win on id collision (sample < imported < user); overrides win over all.
 */
export function resolveCompanies(
  sample: readonly Company[],
  imported: readonly Company[],
  user: readonly Company[],
  overrides: Readonly<Record<string, CompanyOverrideInput>> = {},
): Company[] {
  const byId = new Map<string, Company>();
  for (const c of [...sample, ...imported, ...user]) byId.set(c.id, c);
  const out: Company[] = [];
  for (const c of byId.values()) {
    const o = overrides[c.id];
    if (!o) {
      out.push(c);
      continue;
    }
    const merged: Company = {
      ...c,
      name: o.name ?? c.name,
      bucketDefault: o.bucketDefault ?? c.bucketDefault,
      ratings: o.ratings ? { ...c.ratings, ...o.ratings } : c.ratings,
      ratingsProvenance:
        o.ratings && Object.keys(o.ratings).length > 0 ? 'user' : c.ratingsProvenance,
      political: o.political ? { ...c.political, ...o.political, provenance: 'user' } : c.political,
    };
    out.push(merged);
  }
  return out;
}

export function slugId(name: string, prefix = 'user'): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${prefix}-${slug || 'company'}`;
}

/** Create an unrated, user-provenance company from free text (§7 step 4). */
export function makeUserCompany(
  name: string,
  bucketDefault: Company['bucketDefault'],
  id = slugId(name),
): Company {
  return {
    id,
    name: name.trim(),
    sector: 'Unspecified',
    bucketDefault,
    political: {
      leanScore: null,
      confidence: 'low',
      sourceHint: 'Added by you — verify at OpenSecrets · FEC.gov · Goods Unite Us before rating.',
      provenance: 'user',
    },
    ratings: {},
    ratingsProvenance: 'user',
    fictional: false,
  };
}
