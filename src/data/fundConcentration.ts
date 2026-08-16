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
  topHoldings: { symbol: string | null; name: string; weight: number }[];
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
