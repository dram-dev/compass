import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';

/**
 * Step 3 — the connection graph. Nodes: top-N funds + the companies they hold. Edges: holding weight.
 * Per-company concentration = how much of the fund universe points at it (max weight, #funds,
 * AUM-weighted dollars). Exported as JSON for the app; the SQLite views hold the full detail.
 */
export function buildGraph(
  db,
  { topN = CONFIG.topN, topHoldingsPerFund = 25, maxCompanies = 500 } = {},
) {
  const funds = db
    .prepare(
      `SELECT symbol, name, kind, family, category, net_assets, expense_ratio, holdings_source, holdings_as_of, proxy_of, popularity_rank
    FROM fund WHERE popularity_rank IS NOT NULL AND popularity_rank <= ? ORDER BY popularity_rank, symbol`,
    )
    .all(topN);
  const topHoldings = db.prepare(
    `SELECT holding_symbol AS symbol, holding_name AS name, weight FROM fund_holding WHERE fund_symbol = ? ORDER BY weight DESC LIMIT ?`,
  );
  const fundNodes = funds.map((f) => ({
    symbol: f.symbol,
    name: f.name,
    kind: f.kind,
    family: f.family,
    category: f.category,
    netAssets: f.net_assets,
    expenseRatio: f.expense_ratio,
    rank: f.popularity_rank,
    holdingsSource: f.holdings_source,
    asOf: f.holdings_as_of,
    proxyOf: f.proxy_of,
    topHoldings: topHoldings.all(f.symbol, topHoldingsPerFund),
  }));

  const conc = db
    .prepare(
      `
    SELECT v.symbol, v.name, v.funds_holding, v.max_weight, v.avg_weight, v.aum_weighted_usd, v.max_weight_fund,
           c.name AS company_name, c.sector, c.industry, c.market_cap, c.country
    FROM v_company_concentration v LEFT JOIN company c ON c.symbol = v.symbol
    ORDER BY v.aum_weighted_usd DESC, v.funds_holding DESC LIMIT ?`,
    )
    .all(maxCompanies);
  const companies = conc.map((r) => ({
    symbol: r.symbol,
    name: r.company_name ?? r.name,
    sector: r.sector,
    industry: r.industry,
    marketCap: r.market_cap,
    country: r.country,
    fundsHolding: r.funds_holding,
    maxWeight: r.max_weight,
    maxWeightFund: r.max_weight_fund,
    avgWeight: r.avg_weight,
    aumWeightedUsd: r.aum_weighted_usd,
    // "% of this company's market cap held by the top-N funds" when both sides are known
    shareOfMarketCap: r.market_cap ? r.aum_weighted_usd / r.market_cap : null,
  }));

  const edgeRows = db
    .prepare(
      `
    SELECT h.fund_symbol AS fund, h.holding_symbol AS company, h.weight
    FROM fund_holding h JOIN fund f ON f.symbol = h.fund_symbol
    WHERE h.holding_symbol IS NOT NULL AND f.popularity_rank IS NOT NULL AND f.popularity_rank <= ?
      AND h.weight >= 0.005
    ORDER BY h.fund_symbol, h.weight DESC`,
    )
    .all(topN);
  const inCompanies = new Set(companies.map((c) => c.symbol));
  const edges = edgeRows
    .filter((e) => inCompanies.has(e.company))
    .map((e) => ({ fund: e.fund, company: e.company, weight: e.weight }));

  const totals = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM fund) AS funds, (SELECT COUNT(*) FROM fund_holding) AS holdings,
    (SELECT COUNT(*) FROM company) AS companies, (SELECT COUNT(*) FROM financial_period) AS periods`,
    )
    .get();
  return {
    schema: 'compass-fund-concentration',
    version: 1,
    generatedAt: new Date().toISOString(),
    topN,
    counts: {
      fundsInGraph: fundNodes.length,
      companiesInGraph: companies.length,
      edges: edges.length,
      db: totals,
    },
    sources: {
      etfHoldings: 'Alpha Vantage ETF_PROFILE (holdings + net assets); user-supplied key',
      mutualFundHoldings:
        'SEC EDGAR Form N-PORT primary documents (public); index funds may proxy an ETF share class',
      companies: 'Alpha Vantage OVERVIEW / INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW',
      note: 'Weights are as-of each fund’s latest report; AUM-weighted dollars are approximate. Educational, not investment advice.',
    },
    funds: fundNodes,
    companies,
    edges,
  };
}

export function exportGraph(graph, outPath = CONFIG.exportPath) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(graph) + '\n');
  return outPath;
}
