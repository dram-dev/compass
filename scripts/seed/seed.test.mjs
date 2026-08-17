// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyAvBody,
  normalizeTicker,
  parseEtfProfile,
  parseOverview,
  parseStatements,
} from './alphavantage.mjs';
import { condenseHoldings, parseNport, parseTickerMap, pickLatestNport } from './sec.mjs';
import {
  buildEffectiveHoldings,
  openDb,
  replaceHoldings,
  upsertCompany,
  upsertFund,
  upsertPeriod,
} from './db.mjs';
import { normOrg } from './orgmatch.mjs';
import { rankFunds } from './seed-funds.mjs';
import { companyQueue } from './seed-companies.mjs';
import { buildGraph } from './build-graph.mjs';

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const xml = readFileSync(new URL('./fixtures/sec-nport-sample.xml', import.meta.url), 'utf8');

describe('Alpha Vantage parsers (real demo payload shapes)', () => {
  it('classifies ok / throttled / premium / error / empty bodies', () => {
    expect(classifyAvBody(fx('av-overview-ibm.json')).kind).toBe('ok');
    expect(classifyAvBody(fx('av-throttled.json')).kind).toBe('throttled');
    expect(classifyAvBody({ Information: 'This is a premium endpoint' }).kind).toBe('premium');
    expect(classifyAvBody({ 'Error Message': 'Invalid API call' }).kind).toBe('error');
    expect(classifyAvBody({}).kind).toBe('empty');
    expect(classifyAvBody(null).kind).toBe('empty');
  });

  it('parseEtfProfile: QQQ → meta + sorted fractional weights, capped', () => {
    const p = parseEtfProfile(fx('av-etf-profile-qqq.json'), { maxHoldings: 5 });
    expect(p.meta.net_assets).toBe(452800000000);
    expect(p.meta.expense_ratio).toBeCloseTo(0.0018, 6);
    expect(p.meta.inception_date).toBe('1999-03-10');
    expect(p.holdings).toHaveLength(5);
    expect(p.holdings[0]).toEqual({ symbol: 'NVDA', name: 'NVIDIA CORP', weight: 0.0807 });
    for (let i = 1; i < p.holdings.length; i++)
      expect(p.holdings[i - 1].weight).toBeGreaterThanOrEqual(p.holdings[i].weight);
    expect(parseEtfProfile({ Information: 'x' })).toBeNull();
  });

  it('parseOverview: IBM → normalized numeric columns and raw JSON', () => {
    const c = parseOverview(fx('av-overview-ibm.json'), '2026-08-16T00:00:00Z');
    expect(c.symbol).toBe('IBM');
    expect(c.sector).toBe('TECHNOLOGY');
    expect(typeof c.market_cap).toBe('number');
    expect(c.market_cap).toBeGreaterThan(1e9);
    expect(JSON.parse(c.overview_json).Symbol).toBe('IBM');
    expect(parseOverview({}, 'x')).toBeNull();
    expect(
      parseOverview({ Symbol: 'X', PERatio: 'None', MarketCapitalization: '-' }, 'x').pe_ratio,
    ).toBeNull();
  });

  it('parseStatements merges income/balance/cash flow by period and derives free cash flow', () => {
    const rows = parseStatements(
      'IBM',
      {
        income: fx('av-income-ibm.json'),
        balance: fx('av-balance-ibm.synth.json'),
        cashflow: fx('av-cashflow-ibm.synth.json'),
      },
      'now',
    );
    const annual = rows.filter((r) => r.period_type === 'annual');
    expect(annual).toHaveLength(2);
    const a = annual.find((r) => r.fiscal_date_ending === '2025-12-31');
    expect(a.total_revenue).toBeGreaterThan(1e10);
    expect(a.total_assets).toBe(137175000000);
    expect(a.operating_cashflow).toBe(13445000000);
    expect(a.free_cashflow).toBe(13445000000 - 1685000000);
    expect(JSON.parse(a.income_json).fiscalDateEnding).toBe('2025-12-31');
    expect(rows.some((r) => r.period_type === 'quarterly')).toBe(true);
    // missing payloads are tolerated
    expect(parseStatements('X', { income: null, balance: null, cashflow: null }, 'now')).toEqual(
      [],
    );
  });

  it('normalizeTicker drops cash/other rows and junk', () => {
    expect(normalizeTicker(' brk.b ')).toBe('BRK-B');
    expect(normalizeTicker('BRK/B')).toBe('BRK-B');
    expect(normalizeTicker('BF.B')).toBe('BF-B');
    expect(normalizeTicker('CASH')).toBeNull();
    expect(normalizeTicker('n/a')).toBeNull();
    expect(normalizeTicker('')).toBeNull();
    expect(normalizeTicker('WAY TOO LONG SYMBOL')).toBeNull();
  });
});

describe('SEC N-PORT parsing', () => {
  it('parseNport extracts series, report date, net assets and holdings; skips rows without pctVal', () => {
    const p = parseNport(xml);
    expect(p.seriesId).toBe('S000002839');
    expect(p.seriesName).toBe('Vanguard 500 Index Fund');
    expect(p.reportDate).toBe('2026-05-31');
    expect(p.netAssets).toBe(1234566655556);
    expect(p.holdings).toHaveLength(4);
    const nvda = p.holdings[0];
    expect(nvda).toMatchObject({
      symbol: 'NVDA',
      cusip: '67066G104',
      isin: 'US67066G1040',
      valueUsd: 96000000000,
      assetCat: 'EC',
    });
    expect(nvda.weight).toBeCloseTo(0.07777, 6);
    const mlf = p.holdings[2];
    expect(mlf.symbol).toBeNull();
    expect(mlf.cusip).toBe('');
    expect(parseNport('<html>nope</html>')).toBeNull();
    const de = parseNport(
      '<edgarSubmission><formData><invstOrSecs><invstOrSec><name>Siemens Energy AG</name><identifiers><isin value="DE000ENER6Y0"/><ticker value="ENR"/></identifiers><pctVal>1.0</pctVal><assetCat>EC</assetCat><invCountry>DE</invCountry></invstOrSec><invstOrSec><name>Energizer Holdings Inc</name><identifiers><isin value="US29272W1099"/><ticker value="ENR"/></identifiers><pctVal>1.0</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec></invstOrSecs></formData></edgarSubmission>',
    );
    expect(de.holdings.map((h) => h.symbol)).toEqual(['ENR.DE', 'ENR']);
  });

  it('condenseHoldings never merges distinct ISIN-only holdings (empty CUSIP is not a key)', () => {
    const c = condenseHoldings([
      { symbol: null, cusip: '', isin: 'GB0000456144', name: 'ANTOFAGASTA PLC', weight: 0.001 },
      { symbol: null, cusip: '', isin: 'SE0000115446', name: 'VOLVO AB', weight: 0.002 },
      { symbol: null, cusip: '', isin: null, name: 'Galderma Group AG', weight: 0.003 },
      { symbol: null, cusip: '', isin: null, name: 'Galderma Group AG', weight: 0.001 },
    ]);
    expect(c.map((h) => [h.name, +h.weight.toFixed(4)])).toEqual([
      ['Galderma Group AG', 0.004],
      ['VOLVO AB', 0.002],
      ['ANTOFAGASTA PLC', 0.001],
    ]);
  });
  it('condenseHoldings merges duplicates and caps', () => {
    const c = condenseHoldings(
      [
        { symbol: 'A', name: 'A', weight: 0.1 },
        { symbol: 'A', name: 'A', weight: 0.05, valueUsd: 5 },
        { symbol: 'B', name: 'B', weight: 0.2 },
        { symbol: 'C', name: 'C', weight: 0 },
      ],
      { maxHoldings: 1 },
    );
    expect(c).toHaveLength(1);
    expect(c[0].symbol).toBe('B');
    const all = condenseHoldings([
      { symbol: 'A', name: 'A', weight: 0.1 },
      { symbol: 'A', name: 'A', weight: 0.05 },
    ]);
    expect(all[0].weight).toBeCloseTo(0.15, 10);
  });

  it('parseTickerMap and pickLatestNport', () => {
    const m = parseTickerMap({
      fields: ['cik', 'seriesId', 'classId', 'symbol'],
      data: [
        [36405, 'S000002839', 'C000007779', 'VFIAX'],
        [36405, 'S000002839', 'C000007780', 'vfinx'],
      ],
    });
    expect(m.get('VFIAX')).toEqual({
      cik: '0000036405',
      seriesId: 'S000002839',
      classId: 'C000007779',
    });
    expect(m.get('VFINX').classId).toBe('C000007780');
    const f = pickLatestNport({
      filings: {
        recent: {
          form: ['NPORT-P', '485BPOS', 'NPORT-P'],
          accessionNumber: ['a', 'b', 'c'],
          filingDate: ['2026-01-01', '2026-02-01', '2026-03-01'],
          reportDate: ['2025-11-30', null, '2026-01-31'],
          primaryDocument: ['primary_doc.xml', 'x.htm', 'primary_doc.xml'],
        },
      },
    });
    expect(f.map((x) => x.accession)).toEqual(['c', 'a']);
    expect(pickLatestNport({})).toBeNull();
  });
});

describe('DB, ranking and graph (in-memory SQLite)', () => {
  const setup = () => {
    const db = openDb(':memory:');
    const t = '2026-08-16T00:00:00Z';
    const fund = (symbol, name, kind, net_assets, extra = {}) =>
      upsertFund(db, {
        symbol,
        name,
        kind,
        family: null,
        category: null,
        net_assets,
        expense_ratio: null,
        dividend_yield: null,
        inception_date: null,
        holdings_source: 'test',
        holdings_as_of: '2026-06-30',
        proxy_of: null,
        sec_cik: null,
        sec_series_id: null,
        sec_class_id: null,
        popularity_rank: null,
        raw_json: null,
        fetched_at: t,
        ...extra,
      });
    fund('SPY', 'SPY', 'etf', 600e9);
    fund('QQQ', 'QQQ', 'etf', 300e9);
    fund('VOO', 'Vanguard S&P 500 ETF', 'etf', 500e9);
    fund('VFIAX', 'VFIAX', 'mutual', null, { proxy_of: 'VOO', holdings_source: 'proxy:VOO' });
    fund('BND', 'BND', 'etf', 100e9);
    replaceHoldings(
      db,
      'SPY',
      [
        { symbol: 'AAPL', name: 'Apple', weight: 0.07 },
        { symbol: 'MSFT', name: 'Microsoft', weight: 0.06 },
        { symbol: null, name: 'Cash', weight: 0.01 },
      ],
      'test',
    );
    replaceHoldings(
      db,
      'QQQ',
      [
        { symbol: 'NVDA', name: 'Nvidia', weight: 0.08 },
        { symbol: 'AAPL', name: 'Apple', weight: 0.07 },
      ],
      'test',
    );
    replaceHoldings(
      db,
      'VOO',
      [
        { symbol: 'AAPL', name: 'Apple', weight: 0.065 },
        { symbol: 'MSFT', name: 'Microsoft', weight: 0.06 },
      ],
      'test',
    );
    replaceHoldings(
      db,
      'VFIAX',
      [
        { symbol: 'AAPL', name: 'Apple', weight: 0.065 },
        { symbol: 'MSFT', name: 'Microsoft', weight: 0.06 },
      ],
      'proxy:VOO',
    );
    replaceHoldings(db, 'BND', [{ symbol: null, name: 'US Treasury 4%', weight: 0.02 }], 'test');
    upsertCompany(db, {
      ...parseOverviewLike('AAPL', 'Apple Inc', 'TECHNOLOGY', 3e12),
      fetched_at: t,
    });
    // a target-date style fund holding VOO's series by name (registered fund) → look-through expands it
    fund('VTGT', 'Vanguard Target Retirement 2050 Fund', 'mutual', 50e9);
    replaceHoldings(
      db,
      'VTGT',
      [
        {
          symbol: null,
          name: 'Vanguard S&P 500 ETF — VANG-500',
          weight: 0.5,
          issuerCat: 'RF',
          assetCat: 'EC',
        },
        { symbol: null, name: 'US Treasury 3%', weight: 0.5, issuerCat: 'UST', assetCat: 'DBT' },
      ],
      'test',
    );
    buildEffectiveHoldings(db, normOrg);
    return db;
  };
  const parseOverviewLike = (symbol, name, sector, market_cap) => ({
    symbol,
    name,
    asset_type: 'Common Stock',
    exchange: 'NASDAQ',
    currency: 'USD',
    country: 'USA',
    sector,
    industry: null,
    description: null,
    cik: null,
    fiscal_year_end: null,
    market_cap,
    ebitda: null,
    pe_ratio: null,
    peg_ratio: null,
    book_value: null,
    dividend_yield: null,
    eps: null,
    revenue_ttm: null,
    gross_profit_ttm: null,
    profit_margin: null,
    operating_margin_ttm: null,
    roa_ttm: null,
    roe_ttm: null,
    beta: null,
    week52_high: null,
    week52_low: null,
    shares_outstanding: null,
    overview_json: '{}',
    source: 'test',
  });

  it('rankFunds orders by net assets, excludes share-class duplicates, which inherit their proxy rank', () => {
    const db = setup();
    const r = rankFunds(db, 3);
    expect(r.ranked).toBe(5);
    const rank = Object.fromEntries(
      db
        .prepare('SELECT symbol, popularity_rank FROM fund')
        .all()
        .map((x) => [x.symbol, x.popularity_rank]),
    );
    expect(rank).toEqual({ SPY: 1, VOO: 2, QQQ: 3, BND: 4, VTGT: 5, VFIAX: 2 });
    expect(r.inTop).toBe(4); // SPY, VOO, QQQ + VFIAX inheriting 2
  });

  it('v_company_concentration ignores proxies and null symbols; buildGraph exports nodes/edges/concentration', () => {
    const db = setup();
    rankFunds(db, 200);
    const conc = db
      .prepare('SELECT * FROM v_company_concentration ORDER BY aum_weighted_usd DESC')
      .all();
    const aapl = conc.find((c) => c.symbol === 'AAPL');
    expect(aapl.funds_holding).toBe(4); // SPY, QQQ, VOO + VTGT via look-through
    expect(aapl.max_weight).toBeCloseTo(0.07, 10);
    expect(aapl.aum_weighted_usd).toBeCloseTo(
      0.07 * 600e9 + 0.07 * 300e9 + 0.065 * 500e9 + 0.5 * 0.065 * 50e9,
      0,
    );
    const lt = db
      .prepare(
        "SELECT holding_symbol s, weight w, via_fund v FROM fund_holding_effective WHERE fund_symbol='VTGT' ORDER BY w DESC",
      )
      .all();
    expect(lt.find((x) => x.s === 'AAPL')).toMatchObject({ w: 0.5 * 0.065, v: 'VOO' });
    expect(lt.some((x) => x.s === null && x.v === null)).toBe(true); // the treasury row copied as-is
    expect(['SPY', 'QQQ']).toContain(aapl.max_weight_fund);
    expect(conc.some((c) => c.symbol === null)).toBe(false);
    const g = buildGraph(db, { topN: 200, topHoldingsPerFund: 2, maxCompanies: 10 });
    expect(g.counts.fundsInGraph).toBe(6);
    expect(g.companies[0].symbol).toBe('AAPL');
    expect(g.companies[0].sector).toBe('TECHNOLOGY');
    expect(g.companies[0].shareOfMarketCap).toBeCloseTo(aapl.aum_weighted_usd / 3e12, 10);
    expect(g.edges.every((e) => e.weight >= 0.005)).toBe(true);
    expect(g.edges.filter((e) => e.fund === 'VFIAX')).toHaveLength(2); // proxied fund still visible for look-through
    expect(g.funds.find((f) => f.symbol === 'VFIAX').proxyOf).toBe('VOO');
  });

  it('companyQueue: sample-brand tickers first, then holdings by AUM-weighted concentration, deduped', () => {
    const db = setup();
    rankFunds(db, 200);
    const q = companyQueue(db, { topN: 200 });
    expect(q[0]).toBe('AMZN'); // first sample ticker
    expect(q.indexOf('AAPL')).toBeGreaterThan(q.indexOf('WMT'));
    expect(q.indexOf('AAPL')).toBeLessThan(q.indexOf('MSFT'));
    expect(new Set(q).size).toBe(q.length);
    expect(q).not.toContain('BRK.B'); // dot tickers pass but must be ≤ 6 chars; 'BRK-B' from the sample map is present
    expect(q).toContain('BRK-B');
  });

  it('upsertPeriod merges partial statements without clobbering earlier values', () => {
    const db = setup();
    const base = {
      symbol: 'AAPL',
      period_type: 'annual',
      fiscal_date_ending: '2025-09-30',
      reported_currency: 'USD',
      total_revenue: 100,
      gross_profit: null,
      operating_income: null,
      net_income: null,
      ebitda: null,
      total_assets: null,
      total_liabilities: null,
      shareholder_equity: null,
      cash_and_equivalents: null,
      long_term_debt: null,
      operating_cashflow: null,
      capital_expenditures: null,
      dividend_payout: null,
      free_cashflow: null,
      income_json: '{"a":1}',
      balance_json: null,
      cashflow_json: null,
      fetched_at: 't1',
    };
    upsertPeriod(db, base);
    upsertPeriod(db, {
      ...base,
      total_revenue: null,
      total_assets: 500,
      income_json: null,
      balance_json: '{"b":2}',
      fetched_at: 't2',
    });
    const row = db.prepare('SELECT * FROM financial_period').get();
    expect(row.total_revenue).toBe(100);
    expect(row.total_assets).toBe(500);
    expect(row.income_json).toBe('{"a":1}');
    expect(row.balance_json).toBe('{"b":2}');
    expect(row.fetched_at).toBe('t2');
  });
});
