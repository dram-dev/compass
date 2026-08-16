import { CONFIG } from './config.mjs';
import { cachedGet, makeLimiter, RetryableError, ThrottledError } from './http.mjs';
import { num } from './db.mjs';

const limiter = makeLimiter(CONFIG.alphaVantage.perMinute, 60_000);
let callsThisRun = 0;
export const avCallsThisRun = () => callsThisRun;

/** Alpha Vantage returns 200 with {Note|Information} when throttled or when the endpoint is premium. */
export function classifyAvBody(body) {
  if (!body || typeof body !== 'object') return { kind: 'empty' };
  if (body['Error Message']) return { kind: 'error', message: body['Error Message'] };
  const note = body.Note ?? body.Information;
  if (note) {
    if (/premium/i.test(note)) return { kind: 'premium', message: note };
    return { kind: 'throttled', message: note };
  }
  if (Object.keys(body).length === 0) return { kind: 'empty' };
  return { kind: 'ok' };
}

async function av(fn, symbol, extra = {}, { offline = false } = {}) {
  const params = new URLSearchParams({
    function: fn,
    symbol,
    apikey: CONFIG.alphaVantage.key || 'demo',
    ...extra,
  });
  const url = `${CONFIG.alphaVantage.base}?${params}`;
  const cacheKey = `${fn}:${symbol}:${JSON.stringify(extra)}`; // key excludes the apikey
  const r = await cachedGet('alphavantage', url, {
    limiter,
    offline,
    cacheKey,
    validate: (body) => {
      const c = classifyAvBody(body);
      if (c.kind === 'throttled') {
        // per-minute limit → retry after a minute; daily limit → give up for this run
        if (/per day|daily|25 requests/i.test(c.message)) throw new ThrottledError(c.message);
        throw new RetryableError(c.message, 61_000);
      }
      if (c.kind === 'premium') throw new ThrottledError(`premium endpoint: ${c.message}`);
      if (c.kind === 'error') throw new Error(c.message);
      if (c.kind === 'empty') throw new Error('empty response');
    },
  });
  if (!r.cached && !r.offline) callsThisRun++;
  return r;
}

export const fetchOverview = (symbol, o) => av('OVERVIEW', symbol, {}, o);
export const fetchIncome = (symbol, o) => av('INCOME_STATEMENT', symbol, {}, o);
export const fetchBalance = (symbol, o) => av('BALANCE_SHEET', symbol, {}, o);
export const fetchCashFlow = (symbol, o) => av('CASH_FLOW', symbol, {}, o);
export const fetchEtfProfile = (symbol, o) => av('ETF_PROFILE', symbol, {}, o);

// ------------------------------------------------------------------ pure parsers (unit-tested)

export function parseOverview(body, fetchedAt) {
  if (!body?.Symbol) return null;
  return {
    symbol: String(body.Symbol).toUpperCase(),
    name: body.Name ?? body.Symbol,
    asset_type: body.AssetType ?? null,
    exchange: body.Exchange ?? null,
    currency: body.Currency ?? null,
    country: body.Country ?? null,
    sector: body.Sector ?? null,
    industry: body.Industry ?? null,
    description: body.Description ?? null,
    cik: body.CIK ?? null,
    fiscal_year_end: body.FiscalYearEnd ?? null,
    market_cap: num(body.MarketCapitalization),
    ebitda: num(body.EBITDA),
    pe_ratio: num(body.PERatio),
    peg_ratio: num(body.PEGRatio),
    book_value: num(body.BookValue),
    dividend_yield: num(body.DividendYield),
    eps: num(body.EPS),
    revenue_ttm: num(body.RevenueTTM),
    gross_profit_ttm: num(body.GrossProfitTTM),
    profit_margin: num(body.ProfitMargin),
    operating_margin_ttm: num(body.OperatingMarginTTM),
    roa_ttm: num(body.ReturnOnAssetsTTM),
    roe_ttm: num(body.ReturnOnEquityTTM),
    beta: num(body.Beta),
    week52_high: num(body['52WeekHigh']),
    week52_low: num(body['52WeekLow']),
    shares_outstanding: num(body.SharesOutstanding),
    overview_json: JSON.stringify(body),
    source: 'alphavantage',
    fetched_at: fetchedAt,
  };
}

/** Merge INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW payloads into period rows keyed by (type, date). */
export function parseStatements(symbol, { income, balance, cashflow }, fetchedAt) {
  const rows = new Map();
  const row = (type, date) => {
    const k = `${type}|${date}`;
    if (!rows.has(k)) {
      rows.set(k, {
        symbol,
        period_type: type,
        fiscal_date_ending: date,
        reported_currency: null,
        total_revenue: null,
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
        income_json: null,
        balance_json: null,
        cashflow_json: null,
        fetched_at: fetchedAt,
      });
    }
    return rows.get(k);
  };
  const each = (payload, cb) => {
    for (const [type, key] of [
      ['annual', 'annualReports'],
      ['quarterly', 'quarterlyReports'],
    ]) {
      for (const r of payload?.[key] ?? [])
        if (r?.fiscalDateEnding) cb(row(type, r.fiscalDateEnding), r);
    }
  };
  each(income, (p, r) => {
    p.reported_currency = r.reportedCurrency ?? p.reported_currency;
    p.total_revenue = num(r.totalRevenue);
    p.gross_profit = num(r.grossProfit);
    p.operating_income = num(r.operatingIncome);
    p.net_income = num(r.netIncome);
    p.ebitda = num(r.ebitda);
    p.income_json = JSON.stringify(r);
  });
  each(balance, (p, r) => {
    p.reported_currency = r.reportedCurrency ?? p.reported_currency;
    p.total_assets = num(r.totalAssets);
    p.total_liabilities = num(r.totalLiabilities);
    p.shareholder_equity = num(r.totalShareholderEquity);
    p.cash_and_equivalents = num(r.cashAndCashEquivalentsAtCarryingValue);
    p.long_term_debt = num(r.longTermDebt);
    p.balance_json = JSON.stringify(r);
  });
  each(cashflow, (p, r) => {
    p.reported_currency = r.reportedCurrency ?? p.reported_currency;
    p.operating_cashflow = num(r.operatingCashflow);
    p.capital_expenditures = num(r.capitalExpenditures);
    p.dividend_payout = num(r.dividendPayout);
    p.free_cashflow =
      p.operating_cashflow !== null && p.capital_expenditures !== null
        ? p.operating_cashflow - p.capital_expenditures
        : null;
    p.cashflow_json = JSON.stringify(r);
  });
  return [...rows.values()];
}

/** Normalize an Alpha Vantage ETF_PROFILE payload → { meta, holdings[] }. Weights come as fractions ("0.0712"). */
export function parseEtfProfile(body, { maxHoldings = 250 } = {}) {
  if (!body || !Array.isArray(body.holdings)) return null;
  const holdings = body.holdings
    .map((h) => ({
      symbol: normalizeTicker(h.symbol),
      name: String(h.description ?? h.symbol ?? '').trim() || 'UNKNOWN',
      weight: num(h.weight) ?? 0,
    }))
    .filter((h) => h.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxHoldings);
  return {
    meta: {
      net_assets: num(body.net_assets),
      expense_ratio: num(body.net_expense_ratio),
      dividend_yield: num(body.dividend_yield),
      inception_date: body.inception_date ?? null,
      leveraged: body.leveraged ?? null,
      sectors: (body.sectors ?? []).map((s) => ({ sector: s.sector, weight: num(s.weight) })),
    },
    holdings,
  };
}

/** Uppercase; drop share-class suffixes AV sometimes emits ("BRK.B" → "BRK-B" style is kept as BRK.B); null for cash/other rows. */
export function normalizeTicker(raw) {
  if (!raw) return null;
  const t = String(raw).trim().toUpperCase();
  if (!t || t === 'N/A' || t === '-' || /^(CASH|USD|OTHER|FUTURES?)$/i.test(t)) return null;
  if (!/^[A-Z0-9.\-]{1,10}$/.test(t)) return null;
  return t;
}
