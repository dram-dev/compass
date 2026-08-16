import type { BucketId, Company } from '@/engine/types';
import { BUCKET_IDS } from '@/engine/types';
import { SAMPLE_COMPANY_BY_ID } from './sampleCompanies';

export const DATA_PACK_SCHEMA = 'compass-data-pack';
export const DATA_PACK_VERSION = 1;

export interface DataPackPrinciple {
  id: string;
  label: string;
}
export interface DataPackResult {
  ok: true;
  source: string;
  sourceUrl?: string;
  notes?: string;
  companies: Company[];
  principles: DataPackPrinciple[];
  overridesSample: number;
}
export type DataPackParse = DataPackResult | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const inRange = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -2 && n <= 2;
const DEFAULT_HINT = 'Imported — verify at OpenSecrets · FEC.gov · Goods Unite Us before acting.';

/** EF9 — validate a community data pack (docs/data-pack-schema.md). Whole-file accept or reject. */
export function parseDataPack(text: string): DataPackParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: `Not valid JSON: ${e instanceof Error ? e.message : 'parse error'}.`,
    };
  }
  if (!isObj(raw)) return { ok: false, error: 'Top level must be a JSON object.' };
  if (raw.schema !== DATA_PACK_SCHEMA)
    return { ok: false, error: `schema must be "${DATA_PACK_SCHEMA}".` };
  if (raw.version !== DATA_PACK_VERSION)
    return {
      ok: false,
      error: `version must be ${DATA_PACK_VERSION} (got ${String(raw.version)}).`,
    };
  if (!isStr(raw.source))
    return { ok: false, error: 'source is required (who researched this, and when).' };
  if (!Array.isArray(raw.companies) || raw.companies.length === 0)
    return { ok: false, error: 'companies must be a non-empty array.' };
  if (raw.companies.length > 5000)
    return { ok: false, error: 'companies: at most 5000 records per pack.' };
  const source = raw.source.trim();

  const principles: DataPackPrinciple[] = [];
  if (raw.principles !== undefined) {
    if (!Array.isArray(raw.principles)) return { ok: false, error: 'principles must be an array.' };
    for (const p of raw.principles as unknown[]) {
      if (!isObj(p) || !isStr(p.id) || !isStr(p.label))
        return { ok: false, error: 'principles: each needs id and label.' };
      principles.push({ id: p.id.trim(), label: p.label.trim() });
    }
  }

  const ids = new Set<string>();
  const companies: Company[] = [];
  let overridesSample = 0;
  for (let i = 0; i < raw.companies.length; i++) {
    const c = raw.companies[i];
    const where = `companies[${i}]`;
    if (!isObj(c)) return { ok: false, error: `${where}: must be an object.` };
    if (!isStr(c.id)) return { ok: false, error: `${where}: id is required.` };
    if (!isStr(c.name)) return { ok: false, error: `${where} (${c.id}): name is required.` };
    if (ids.has(c.id)) return { ok: false, error: `${where}: duplicate id "${c.id}".` };
    if (!BUCKET_IDS.includes(c.bucketDefault as BucketId))
      return {
        ok: false,
        error: `${where} (${c.id}): bucketDefault must be one of ${BUCKET_IDS.join(', ')}.`,
      };
    let leanScore: number | null = null;
    let confidence: 'low' | 'med' | 'high' = 'low';
    let sourceHint = DEFAULT_HINT;
    if (c.political !== undefined) {
      if (!isObj(c.political))
        return { ok: false, error: `${where} (${c.id}): political must be an object.` };
      if (c.political.leanScore !== undefined && c.political.leanScore !== null) {
        if (!inRange(c.political.leanScore))
          return {
            ok: false,
            error: `${where} (${c.id}): leanScore must be null or within [-2, 2].`,
          };
        leanScore = c.political.leanScore as number;
      }
      if (c.political.confidence !== undefined) {
        if (!['low', 'med', 'high'].includes(String(c.political.confidence)))
          return { ok: false, error: `${where} (${c.id}): confidence must be low, med or high.` };
        confidence = c.political.confidence as 'low' | 'med' | 'high';
      }
      if (isStr(c.political.sourceHint)) sourceHint = c.political.sourceHint.trim();
    }
    const ratings: Record<string, number> = {};
    if (c.ratings !== undefined) {
      if (!isObj(c.ratings))
        return { ok: false, error: `${where} (${c.id}): ratings must be an object.` };
      for (const [k, v] of Object.entries(c.ratings)) {
        if (!inRange(v))
          return { ok: false, error: `${where} (${c.id}): rating "${k}" must be within [-2, 2].` };
        ratings[k] = v as number;
      }
    }
    ids.add(c.id);
    if (SAMPLE_COMPANY_BY_ID[c.id]) overridesSample++;
    companies.push({
      id: c.id.trim(),
      name: c.name.trim(),
      ...(isStr(c.parentCompanyId) ? { parentCompanyId: c.parentCompanyId.trim() } : {}),
      sector: isStr(c.sector) ? c.sector.trim() : 'Unspecified',
      bucketDefault: c.bucketDefault as BucketId,
      political: { leanScore, confidence, sourceHint, provenance: 'imported' },
      ratings,
      ratingsProvenance: 'imported',
      fictional: false,
      source,
      ...(isStr(c.ticker) && /^[A-Z][A-Z0-9.-]{0,9}$/.test(c.ticker.trim().toUpperCase())
        ? { ticker: c.ticker.trim().toUpperCase() }
        : {}),
    });
  }
  for (const c of companies) {
    if (
      c.parentCompanyId &&
      !ids.has(c.parentCompanyId) &&
      !SAMPLE_COMPANY_BY_ID[c.parentCompanyId]
    ) {
      return {
        ok: false,
        error: `${c.id}: parentCompanyId "${c.parentCompanyId}" does not resolve to a pack or sample record.`,
      };
    }
  }
  return {
    ok: true,
    source,
    ...(isStr(raw.sourceUrl) ? { sourceUrl: raw.sourceUrl } : {}),
    ...(isStr(raw.notes) ? { notes: raw.notes } : {}),
    companies,
    principles,
    overridesSample,
  };
}

/** A tiny example pack, offered as a download from the Data page. */
export const EXAMPLE_DATA_PACK = {
  schema: DATA_PACK_SCHEMA,
  version: DATA_PACK_VERSION,
  source: 'Example pack (edit me)',
  sourceUrl: 'https://www.opensecrets.org/orgs/all-profiles',
  notes: 'Replace these records with your own research. Keep leans coarse and cite the source.',
  companies: [
    {
      id: 'example-corner-market',
      name: 'Example Corner Market',
      sector: 'Grocery',
      bucketDefault: 'local',
      political: {
        leanScore: null,
        confidence: 'low',
        sourceHint: 'No filings found — verify at FEC.gov.',
      },
      ratings: { 'local-economy': 2, labor: 1 },
    },
    {
      id: 'example-holdings',
      name: 'Example Holdings',
      sector: 'Conglomerate (holding)',
      bucketDefault: 'major',
      political: {
        leanScore: 0,
        confidence: 'low',
        sourceHint: 'Mixed PAC giving per OpenSecrets org profile (verify).',
      },
      ratings: { 'local-economy': -2 },
    },
  ],
};
