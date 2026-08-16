import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';

export function openDb(dbPath = CONFIG.dbPath) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(readFileSync(CONFIG.schemaPath, 'utf8'));
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
  db.prepare(
    `INSERT INTO company (symbol,name,asset_type,exchange,currency,country,sector,industry,description,cik,fiscal_year_end,
      market_cap,ebitda,pe_ratio,peg_ratio,book_value,dividend_yield,eps,revenue_ttm,gross_profit_ttm,profit_margin,operating_margin_ttm,
      roa_ttm,roe_ttm,beta,week52_high,week52_low,shares_outstanding,overview_json,source,fetched_at)
    VALUES (@symbol,@name,@asset_type,@exchange,@currency,@country,@sector,@industry,@description,@cik,@fiscal_year_end,
      @market_cap,@ebitda,@pe_ratio,@peg_ratio,@book_value,@dividend_yield,@eps,@revenue_ttm,@gross_profit_ttm,@profit_margin,@operating_margin_ttm,
      @roa_ttm,@roe_ttm,@beta,@week52_high,@week52_low,@shares_outstanding,@overview_json,@source,@fetched_at)
    ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, asset_type=excluded.asset_type, exchange=excluded.exchange, currency=excluded.currency,
      country=excluded.country, sector=excluded.sector, industry=excluded.industry, description=excluded.description, cik=excluded.cik,
      fiscal_year_end=excluded.fiscal_year_end, market_cap=excluded.market_cap, ebitda=excluded.ebitda, pe_ratio=excluded.pe_ratio,
      peg_ratio=excluded.peg_ratio, book_value=excluded.book_value, dividend_yield=excluded.dividend_yield, eps=excluded.eps,
      revenue_ttm=excluded.revenue_ttm, gross_profit_ttm=excluded.gross_profit_ttm, profit_margin=excluded.profit_margin,
      operating_margin_ttm=excluded.operating_margin_ttm, roa_ttm=excluded.roa_ttm, roe_ttm=excluded.roe_ttm, beta=excluded.beta,
      week52_high=excluded.week52_high, week52_low=excluded.week52_low, shares_outstanding=excluded.shares_outstanding,
      overview_json=excluded.overview_json, source=excluded.source, fetched_at=excluded.fetched_at`,
  ).run(c);
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
    db.prepare(`INSERT OR REPLACE INTO fund_holding (fund_symbol,holding_symbol,holding_name,cusip,isin,weight,value_usd,as_of,source)
    VALUES (?,?,?,?,?,?,?,?,?)`);
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
      );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
