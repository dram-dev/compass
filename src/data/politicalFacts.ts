import facts from './generated/political-facts.json';
import pack from './generated/political-pack.json';

export interface PartySplit {
  D: number;
  R: number;
  O: number;
  U: number;
  txns?: number;
}
/** One contribution stream on its own (same r, bins and $5k floor as the pooled lean; no confidence tier). */
export interface StreamLean extends PartySplit {
  r: number | null;
  leanScore: number | null;
  partisanUsd: number;
  subsetOf?: 'employee';
}
/** Lobbying topics (subject, never position) and the P1 trade-protection share — docs/political-seed.md. */
export interface ProtectionActivity {
  years: number[];
  lobbyTotalUsd: number;
  filings: number;
  tradeProtection: {
    anyUsd: number;
    weightedUsd: number;
    anyShare: number | null;
    weightedShare: number | null;
    filings: number;
    codes: Record<string, number>;
  };
  topics: Record<
    string,
    { filings: number; usdAny: number; share: number | null; kind: 'code' | 'keyword' }
  >;
  verify: string[];
  method: string;
}
export interface PoliticalFact {
  symbol: string;
  name: string;
  sameAs?: string;
  pac: Record<string, PartySplit>; // by cycle
  employee: Record<string, PartySplit>;
  executive?: Record<string, PartySplit>; // senior-executive subset of employee, by cycle
  pacInflow?: Record<string, number>; // employees' contributions to the company's own PAC, by cycle
  totals: { pac: PartySplit; employee: PartySplit; executive?: PartySplit; pacInflow?: number };
  streams?: { pac: StreamLean; employee: StreamLean; executive: StreamLean };
  lobbying: Record<string, number>; // by year, USD
  topIssues: { name: string; filings: number }[];
  protectionActivity?: ProtectionActivity | null;
  committees: { id: string; name: string; method: string }[];
  clients: { id: number; name: string; method: string }[];
  employers: { employer: string; amount: number }[];
  lean: {
    leanScore: number | null;
    r: number | null;
    totalPartisanUsd: number;
    confidence: 'low' | 'med' | 'high';
    cycles: number[];
    method: string;
  };
  sourceHint: string;
  links: { fec: string[]; lda: string[]; opensecrets: string };
}
export interface PoliticalFactsDoc {
  schema: string;
  version: number;
  generatedAt: string | null;
  cycles: number[];
  method: string;
  counts: {
    companies: number;
    withLean: number;
    withLobbying: number;
    withExecutiveStream?: number;
    withProtectionActivity?: number;
  };
  companies: PoliticalFact[];
}

export const POLITICAL_FACTS: PoliticalFactsDoc = facts as unknown as PoliticalFactsDoc;
export const POLITICAL_FACT_BY_TICKER: Record<string, PoliticalFact> = Object.fromEntries(
  POLITICAL_FACTS.companies.map((c) => [c.symbol, c]),
);
export const hasPoliticalFacts = () => POLITICAL_FACTS.companies.length > 0;

/** The bundled data pack (docs/data-pack-schema.md) produced by the same run; loaded only on user click. */
export const POLITICAL_PACK_JSON: string = JSON.stringify(pack);
export const POLITICAL_PACK_SIZE: number = (pack as { companies: unknown[] }).companies.length;
export const POLITICAL_PACK_SOURCE: string = (pack as { source: string }).source;
