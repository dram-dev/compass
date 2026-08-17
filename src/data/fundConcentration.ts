import raw from './generated/fund-concentration.json';

/** Shape of scripts/seed/build-graph.mjs output (src/data/generated/fund-concentration.json). */
export interface FundNode {
  symbol: string;
  name: string;
  kind: 'etf' | 'mutual';
  family: string | null;
  category: string | null;
  netAssets: number | null;
  expenseRatio: number | null;
  rank: number;
  holdingsSource: string;
  asOf: string | null;
  proxyOf: string | null;
  topHoldings: { symbol: string | null; name: string; weight: number; via?: string | null }[];
  leanExposure?: LeanExposure | null;
}
export interface LeanExposure {
  '-2': number;
  '-1': number;
  '0': number;
  '1': number;
  '2': number;
  unknown: number;
  nonCompany: number;
  coverage: number;
}
export interface CompanyNode {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  country: string | null;
  fundsHolding: number;
  maxWeight: number;
  maxWeightFund: string;
  avgWeight: number;
  aumWeightedUsd: number;
  shareOfMarketCap: number | null;
  lean?: number | null; // FEC/LDA-derived lean (−2..+2); null = below threshold; undefined = no facts
}
export interface FundConcentrationGraph {
  schema: string;
  version: number;
  generatedAt: string | null;
  topN: number;
  counts: { fundsInGraph: number; companiesInGraph: number; edges: number };
  sources: Record<string, string>;
  funds: FundNode[];
  companies: CompanyNode[];
  edges: { fund: string; company: string; weight: number }[];
}

export const FUND_CONCENTRATION: FundConcentrationGraph = raw as unknown as FundConcentrationGraph;
export const hasFundData = () => FUND_CONCENTRATION.funds.length > 0;
export const FUND_BY_SYMBOL: Record<string, FundNode> = Object.fromEntries(
  FUND_CONCENTRATION.funds.map((f) => [f.symbol, f]),
);
export const COMPANY_BY_SYMBOL: Record<string, CompanyNode> = Object.fromEntries(
  FUND_CONCENTRATION.companies.map((c) => [c.symbol, c]),
);

/** Funds (from the seeded graph) that hold `symbol`, heaviest first. */
export function fundsHolding(symbol: string): { fund: FundNode; weight: number }[] {
  return FUND_CONCENTRATION.edges
    .filter((e) => e.company === symbol)
    .map((e) => ({ fund: FUND_BY_SYMBOL[e.fund]!, weight: e.weight }))
    .filter((x) => !!x.fund)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Fund political exposure relative to the user's preference (§6.4 classes). Unconfigured → everything
 * Unknown except nonCompany. Returns fractions of fund assets.
 */
export function classifyExposure(e: LeanExposure, direction: -1 | 0 | 1) {
  // holdings beyond the stored top-250 (1 − coverage) are unassessed → Unknown, never redistributed
  const out = {
    aligned: 0,
    mixed: 0,
    opposed: 0,
    unknown: e.unknown + Math.max(0, 1 - e.coverage),
    nonCompany: e.nonCompany,
  };
  for (const k of ['-2', '-1', '0', '1', '2'] as const) {
    const lean = Number(k);
    const w = e[k];
    if (direction === 0) out.unknown += w;
    else {
      const rel = lean * direction;
      if (rel >= 1) out.aligned += w;
      else if (rel <= -1) out.opposed += w;
      else out.mixed += w;
    }
  }
  return out;
}
