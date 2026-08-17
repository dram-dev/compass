import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';

export function openDb(dbPath = CONFIG.dbPath) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  let db;
  try {
    db = new DatabaseSync(dbPath, { timeout: 15000 }); // busy timeout: parallel seed stages share the DB (WAL)
  } catch {
    db = new DatabaseSync(dbPath);
  }
  db.exec(readFileSync(CONFIG.schemaPath, 'utf8'));
  // Additive columns on existing tables (SQLite has no ADD COLUMN IF NOT EXISTS).
  const ccols = new Set(
    db
      .prepare('PRAGMA table_info(company)')
      .all()
      .map((r) => r.name),
  );
  for (const [c, t] of [
    ['sic', 'TEXT'],
    ['public_float', 'REAL'],
    ['shares_asof', 'TEXT'],
  ])
    if (!ccols.has(c)) db.exec(`ALTER TABLE company ADD COLUMN ${c} ${t}`);
  const cols = new Set(
    db
      .prepare('PRAGMA table_info(fund_holding)')
      .all()
      .map((r) => r.name),
  );
  for (const [c, t] of [
    ['asset_cat', 'TEXT'],
    ['issuer_cat', 'TEXT'],
    ['symbol_method', 'TEXT'],
  ])
    if (!cols.has(c)) db.exec(`ALTER TABLE fund_holding ADD COLUMN ${c} ${t}`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_fund_holding_cusip ON fund_holding(cusip)');
  // Derived tables whose CHECK constraints evolved: rebuild (their contents are recomputed by the seeder).
  const pc = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='political_contribution'")
    .get();
  if (pc && !String(pc.sql).includes('pac-inflow')) {
    db.exec('DROP TABLE political_contribution');
    db.exec(readFileSync(CONFIG.schemaPath, 'utf8'));
  }
  return db;
}

export const now = () => new Date().toISOString();
const num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'None' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export { num };

export function log(db, source, endpoint, key, status, detail = null) {
  db.prepare(
    'INSERT INTO fetch_log (source, endpoint, key, status, detail, at) VALUES (?,?,?,?,?,?)',
  ).run(source, endpoint, key, status, detail, now());
}

export function upsertCompany(db, c) {
  // Merge semantics: new non-null values win; nulls never erase existing data (SEC + Alpha Vantage complement each other).
  const cols = [
    'name',
    'asset_type',
    'exchange',
    'currency',
    'country',
    'sector',
    'industry',
    'description',
    'cik',
    'fiscal_year_end',
    'market_cap',
    'ebitda',
    'pe_ratio',
    'peg_ratio',
    'book_value',
    'dividend_yield',
    'eps',
    'revenue_ttm',
    'gross_profit_ttm',
    'profit_margin',
    'operating_margin_ttm',
    'roa_ttm',
    'roe_ttm',
    'beta',
    'week52_high',
    'week52_low',
    'shares_outstanding',
    'overview_json',
    'sic',
    'public_float',
    'shares_asof',
  ];
  const row = { symbol: c.symbol, source: c.source, fetched_at: c.fetched_at };
  for (const k of cols) row[k] = c[k] === undefined ? null : c[k];
  const sets = cols.map((k) => `${k}=COALESCE(excluded.${k}, company.${k})`).join(', ');
  db.prepare(
    `INSERT INTO company (symbol,${cols.join(',')},source,fetched_at)
    VALUES (@symbol,${cols.map((k) => '@' + k).join(',')},@source,@fetched_at)
    ON CONFLICT(symbol) DO UPDATE SET ${sets},
      source = CASE WHEN instr(company.source, excluded.source) > 0 THEN company.source ELSE company.source || '+' || excluded.source END,
      fetched_at = excluded.fetched_at`,
  ).run(row);
}

export function upsertPeriod(db, p) {
  db.prepare(
    `INSERT INTO financial_period (symbol,period_type,fiscal_date_ending,reported_currency,total_revenue,gross_profit,operating_income,
      net_income,ebitda,total_assets,total_liabilities,shareholder_equity,cash_and_equivalents,long_term_debt,operating_cashflow,
      capital_expenditures,dividend_payout,free_cashflow,income_json,balance_json,cashflow_json,fetched_at)
    VALUES (@symbol,@period_type,@fiscal_date_ending,@reported_currency,@total_revenue,@gross_profit,@operating_income,@net_income,@ebitda,
      @total_assets,@total_liabilities,@shareholder_equity,@cash_and_equivalents,@long_term_debt,@operating_cashflow,@capital_expenditures,
      @dividend_payout,@free_cashflow,@income_json,@balance_json,@cashflow_json,@fetched_at)
    ON CONFLICT(symbol,period_type,fiscal_date_ending) DO UPDATE SET
      reported_currency=COALESCE(excluded.reported_currency,financial_period.reported_currency),
      total_revenue=COALESCE(excluded.total_revenue,financial_period.total_revenue),
      gross_profit=COALESCE(excluded.gross_profit,financial_period.gross_profit),
      operating_income=COALESCE(excluded.operating_income,financial_period.operating_income),
      net_income=COALESCE(excluded.net_income,financial_period.net_income),
      ebitda=COALESCE(excluded.ebitda,financial_period.ebitda),
      total_assets=COALESCE(excluded.total_assets,financial_period.total_assets),
      total_liabilities=COALESCE(excluded.total_liabilities,financial_period.total_liabilities),
      shareholder_equity=COALESCE(excluded.shareholder_equity,financial_period.shareholder_equity),
      cash_and_equivalents=COALESCE(excluded.cash_and_equivalents,financial_period.cash_and_equivalents),
      long_term_debt=COALESCE(excluded.long_term_debt,financial_period.long_term_debt),
      operating_cashflow=COALESCE(excluded.operating_cashflow,financial_period.operating_cashflow),
      capital_expenditures=COALESCE(excluded.capital_expenditures,financial_period.capital_expenditures),
      dividend_payout=COALESCE(excluded.dividend_payout,financial_period.dividend_payout),
      free_cashflow=COALESCE(excluded.free_cashflow,financial_period.free_cashflow),
      income_json=COALESCE(excluded.income_json,financial_period.income_json),
      balance_json=COALESCE(excluded.balance_json,financial_period.balance_json),
      cashflow_json=COALESCE(excluded.cashflow_json,financial_period.cashflow_json),
      fetched_at=excluded.fetched_at`,
  ).run(p);
}

export function upsertFund(db, f) {
  db.prepare(
    `INSERT INTO fund (symbol,name,kind,family,category,net_assets,expense_ratio,dividend_yield,inception_date,holdings_source,
      holdings_as_of,proxy_of,sec_cik,sec_series_id,sec_class_id,popularity_rank,raw_json,fetched_at)
    VALUES (@symbol,@name,@kind,@family,@category,@net_assets,@expense_ratio,@dividend_yield,@inception_date,@holdings_source,
      @holdings_as_of,@proxy_of,@sec_cik,@sec_series_id,@sec_class_id,@popularity_rank,@raw_json,@fetched_at)
    ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, kind=excluded.kind, family=excluded.family, category=excluded.category,
      net_assets=COALESCE(excluded.net_assets,fund.net_assets), expense_ratio=COALESCE(excluded.expense_ratio,fund.expense_ratio),
      dividend_yield=COALESCE(excluded.dividend_yield,fund.dividend_yield), inception_date=COALESCE(excluded.inception_date,fund.inception_date),
      holdings_source=excluded.holdings_source, holdings_as_of=COALESCE(excluded.holdings_as_of,fund.holdings_as_of), proxy_of=excluded.proxy_of,
      sec_cik=COALESCE(excluded.sec_cik,fund.sec_cik), sec_series_id=COALESCE(excluded.sec_series_id,fund.sec_series_id),
      sec_class_id=COALESCE(excluded.sec_class_id,fund.sec_class_id), popularity_rank=COALESCE(excluded.popularity_rank,fund.popularity_rank),
      raw_json=COALESCE(excluded.raw_json,fund.raw_json), fetched_at=excluded.fetched_at`,
  ).run(f);
}

export function replaceHoldings(db, fundSymbol, holdings, source) {
  const del = db.prepare('DELETE FROM fund_holding WHERE fund_symbol = ?');
  const ins =
    db.prepare(`INSERT OR REPLACE INTO fund_holding (fund_symbol,holding_symbol,holding_name,cusip,isin,weight,value_usd,as_of,source,asset_cat,issuer_cat,symbol_method)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  try {
    del.run(fundSymbol);
    for (const h of holdings)
      ins.run(
        fundSymbol,
        h.symbol ?? null,
        h.name,
        h.cusip ?? '',
        h.isin ?? null,
        h.weight,
        h.valueUsd ?? null,
        h.asOf ?? null,
        source,
        h.assetCat ?? null,
        h.issuerCat ?? null,
        h.symbol ? 'filing' : null,
      );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * Back-fill missing holding tickers from other filings: same CUSIP → same ISIN → same normalized name.
 * Only unambiguous keys (exactly one symbol) are used; the method is recorded per row.
 */
export function backfillHoldingSymbols(db, normName) {
  const learn = (rows, keyOf) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (!k) continue;
      const cur = map.get(k);
      if (cur === undefined) map.set(k, r.s);
      else if (cur !== null && cur !== r.s) map.set(k, null); // ambiguous
    }
    return map;
  };
  const known = db
    .prepare(
      'SELECT DISTINCT holding_symbol AS s, cusip AS c, isin AS i, holding_name AS n FROM fund_holding WHERE holding_symbol IS NOT NULL',
    )
    .all();
  const byCusip = learn(
    known.filter((r) => r.c),
    (r) => r.c,
  );
  const byIsin = learn(
    known.filter((r) => r.i),
    (r) => r.i,
  );
  const byName = learn(known, (r) => normName(r.n));
  const upd = db.prepare(
    'UPDATE fund_holding SET holding_symbol = ?, symbol_method = ? WHERE rowid = ?',
  );
  const rows = db
    .prepare(
      'SELECT rowid AS id, holding_name AS n, cusip AS c, isin AS i FROM fund_holding WHERE holding_symbol IS NULL',
    )
    .all();
  const stats = { cusip: 0, isin: 0, name: 0, unresolved: 0 };
  db.exec('BEGIN');
  for (const r of rows) {
    let s = (r.c && byCusip.get(r.c)) || null;
    let m = 'cusip';
    if (!s && r.i) ((s = byIsin.get(r.i) || null), (m = 'isin'));
    if (!s) ((s = byName.get(normName(r.n)) || null), (m = 'name'));
    if (s) {
      upd.run(s, m, r.id);
      stats[m]++;
    } else stats.unresolved++;
  }
  db.exec('COMMIT');
  return stats;
}

/** Fund name → symbol map for look-through: strips share-class words so "Vanguard Total Stock Market Index Fund" ↔ VTSAX/VTI. */
export function fundNameKey(name, normName) {
  return normName(
    String(name)
      .replace(
        /\b(Admiral|Investor|Institutional Plus|Institutional|Inst|Ins\+?|Inv|Adm|ETF|Shares?|Class [A-Z0-9]+|R6|K6?)\b/gi,
        ' ',
      )
      .replace(/[—-].*$/, ''),
  );
}

/**
 * Materialize fund_holding_effective: copies every holding, and additionally expands registered-fund
 * (issuer_cat RF / asset_cat EC with a fund-like name) positions into the underlying fund's holdings × weight
 * when that fund is in the DB. One level only; the underlying's own RF rows are not recursed.
 */
export function buildEffectiveHoldings(db, normName) {
  const funds = db.prepare('SELECT symbol, name FROM fund').all();
  const byKey = new Map();
  for (const f of funds) {
    const k = fundNameKey(f.name, normName);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, f.symbol); // first wins (ETF class before mutual class in the universe order)
  }
  const holdings = db
    .prepare(
      'SELECT fund_symbol, holding_symbol, holding_name, weight, asset_cat, issuer_cat FROM fund_holding',
    )
    .all();
  const byFund = new Map();
  for (const h of holdings)
    (byFund.get(h.fund_symbol) ?? byFund.set(h.fund_symbol, []).get(h.fund_symbol)).push(h);
  const ins = db.prepare(
    'INSERT OR REPLACE INTO fund_holding_effective (fund_symbol, holding_symbol, holding_name, weight, asset_cat, issuer_cat, via_fund) VALUES (?,?,?,?,?,?,?)',
  );
  const stats = { rows: 0, expanded: 0, viaFunds: new Set() };
  db.exec('BEGIN');
  db.exec('DELETE FROM fund_holding_effective');
  for (const [fund, list] of byFund) {
    for (const h of list) {
      const isFundLike =
        h.issuer_cat === 'RF' ||
        /\b(index fund|portfolio|master|trust|etf|fund)\b/i.test(h.holding_name);
      const under = isFundLike ? byKey.get(fundNameKey(h.holding_name, normName)) : undefined;
      if (under && under !== fund && byFund.has(under)) {
        for (const u of byFund.get(under)) {
          if (u.issuer_cat === 'RF') continue; // one level only
          ins.run(
            fund,
            u.holding_symbol,
            u.holding_name,
            u.weight * h.weight,
            u.asset_cat,
            u.issuer_cat,
            under,
          );
          stats.rows++;
        }
        stats.expanded++;
        stats.viaFunds.add(under);
      } else {
        ins.run(fund, h.holding_symbol, h.holding_name, h.weight, h.asset_cat, h.issuer_cat, null);
        stats.rows++;
      }
    }
  }
  db.exec('COMMIT');
  return {
    rows: stats.rows,
    expandedPositions: stats.expanded,
    underlyingFunds: stats.viaFunds.size,
  };
}
