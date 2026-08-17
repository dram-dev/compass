/**
 * SEC XBRL "Financial Statement" data (free, no key):
 *   company_tickers.json                    ticker → CIK
 *   data.sec.gov/submissions/CIK##.json     name, SIC (industry), exchanges, fiscal year end
 *   data.sec.gov/api/xbrl/companyfacts/…    every reported us-gaap / dei fact with periods and forms
 * Filings are the primary source of statements; Alpha Vantage OVERVIEW enriches (market cap, ratios).
 */
import { CONFIG } from './config.mjs';
import { cachedGet, makeLimiter } from './http.mjs';
import { num } from './db.mjs';

const limiter = makeLimiter(CONFIG.sec.perSecond, 1000);
const headers = () => ({
  'User-Agent': CONFIG.sec.userAgent,
  'Accept-Encoding': 'gzip, deflate',
  Accept: 'application/json',
});
const cik10 = (cik) => String(cik).padStart(10, '0');

export async function loadTickerCikMap({ offline = false } = {}) {
  const { body } = await cachedGet('sec', 'https://www.sec.gov/files/company_tickers.json', {
    headers: headers(),
    limiter,
    offline,
  });
  if (!body) return null;
  const map = new Map();
  for (const row of Object.values(body)) {
    const t = String(row.ticker ?? '')
      .toUpperCase()
      .replace(/[./](?=[A-Z]$)/, '-');
    if (t && !map.has(t)) map.set(t, { cik: cik10(row.cik_str), title: row.title });
  }
  return map;
}

export async function fetchSubmissions(cik, { offline = false } = {}) {
  const { body } = await cachedGet(
    'sec',
    `https://data.sec.gov/submissions/CIK${cik10(cik)}.json`,
    { headers: headers(), limiter, offline },
  );
  return body ?? null;
}

export async function fetchCompanyFacts(cik, { offline = false } = {}) {
  const { body } = await cachedGet(
    'sec',
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(cik)}.json`,
    { headers: headers(), limiter, offline },
  );
  return body ?? null;
}

// ------------------------------------------------------------------ pure

/** Broad sector from a 2/3-digit SIC prefix (documented, coarse; SIC description is kept as `industry`). */
export function sectorFromSic(sic) {
  const n = Number(sic);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1000) return 'Agriculture';
  if (n < 1500) return 'Mining, oil & gas';
  if (n < 1800) return 'Construction';
  if (n >= 2800 && n < 2900) return 'Chemicals & pharmaceuticals';
  if (n >= 3570 && n < 3580) return 'Computers & office equipment';
  if (n >= 3600 && n < 3700) return 'Electronics & semiconductors';
  if (n >= 3700 && n < 3800) return 'Transportation equipment';
  if (n >= 3840 && n < 3860) return 'Medical devices';
  if (n < 4000) return 'Manufacturing';
  if (n >= 4800 && n < 4900) return 'Communications';
  if (n >= 4900 && n < 5000) return 'Utilities';
  if (n < 5000) return 'Transportation';
  if (n < 5200) return 'Wholesale';
  if (n < 6000) return 'Retail';
  if (n < 6800) return 'Finance, insurance & real estate';
  if (n === 7370 || n === 7371 || n === 7372 || n === 7373 || n === 7374 || n === 7389)
    return 'Software & IT services';
  if (n < 9000) return 'Services';
  return 'Public administration';
}

const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86_400_000;

/**
 * Pick the best fact per (period type, end date) for a concept from companyfacts units.USD entries.
 * `flow`: duration concepts must span ~a year (annual) or ~a quarter (quarterly). Later filings win (restatements).
 */
export function pickFacts(entries, { flow }) {
  const out = { annual: new Map(), quarterly: new Map() };
  for (const e of entries ?? []) {
    if (!e?.end || e.val === undefined || e.val === null) continue;
    const form = String(e.form ?? '');
    const annual = form.startsWith('10-K') && e.fp === 'FY';
    const quarterly = form.startsWith('10-Q') && /^Q[1-3]$/.test(String(e.fp ?? ''));
    if (!annual && !quarterly) continue;
    if (flow) {
      if (!e.start) continue;
      const d = daysBetween(e.start, e.end);
      if (annual && (d < 350 || d > 380)) continue;
      if (quarterly && (d < 80 || d > 100)) continue;
    }
    const bucket = annual ? out.annual : out.quarterly;
    const cur = bucket.get(e.end);
    if (!cur || String(e.filed ?? '') > String(cur.filed ?? '')) bucket.set(e.end, e);
  }
  return out;
}

const CONCEPTS = {
  total_revenue: {
    names: [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
    ],
    flow: true,
  },
  gross_profit: { names: ['GrossProfit'], flow: true },
  operating_income: { names: ['OperatingIncomeLoss'], flow: true },
  net_income: {
    names: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
    flow: true,
  },
  depreciation: {
    names: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
    ],
    flow: true,
  },
  total_assets: { names: ['Assets'], flow: false },
  total_liabilities: { names: ['Liabilities'], flow: false },
  shareholder_equity: {
    names: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
    flow: false,
  },
  cash_and_equivalents: {
    names: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
    flow: false,
  },
  long_term_debt: {
    names: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
    flow: false,
  },
  operating_cashflow: {
    names: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
    flow: true,
  },
  capital_expenditures: {
    names: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    flow: true,
  },
  dividend_payout: {
    names: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock', 'PaymentsOfOrdinaryDividends'],
    flow: true,
  },
};

/** companyfacts → financial_period rows (annual + quarterly), plus header facts (shares, public float). */
export function parseCompanyFacts(symbol, facts, fetchedAt) {
  const gaap = facts?.facts?.['us-gaap'] ?? {};
  const dei = facts?.facts?.dei ?? {};
  const rows = new Map();
  const row = (type, end) => {
    const k = `${type}|${end}`;
    if (!rows.has(k)) {
      rows.set(k, {
        symbol,
        period_type: type,
        fiscal_date_ending: end,
        reported_currency: 'USD',
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
  const dep = new Map();
  for (const [field, spec] of Object.entries(CONCEPTS)) {
    // first concept name with any usable data wins for each period (fallback chain)
    const seen = { annual: new Set(), quarterly: new Set() };
    for (const name of spec.names) {
      const entries = gaap[name]?.units?.USD;
      if (!entries?.length) continue;
      const picked = pickFacts(entries, { flow: spec.flow });
      for (const type of ['annual', 'quarterly']) {
        for (const [end, e] of picked[type]) {
          if (seen[type].has(end)) continue;
          seen[type].add(end);
          if (field === 'depreciation') dep.set(`${type}|${end}`, num(e.val));
          else row(type, end)[field] = num(e.val);
        }
      }
    }
  }
  const out = [];
  for (const [k, r] of rows) {
    if (r.operating_cashflow !== null && r.capital_expenditures !== null)
      r.free_cashflow = r.operating_cashflow - Math.abs(r.capital_expenditures);
    const d = dep.get(k);
    if (r.operating_income !== null && d !== null && d !== undefined)
      r.ebitda = r.operating_income + d;
    // keep only periods with at least one statement figure
    if (
      [r.total_revenue, r.net_income, r.total_assets, r.operating_cashflow].some((v) => v !== null)
    )
      out.push(r);
  }
  out.sort((a, b) =>
    a.period_type === b.period_type
      ? a.fiscal_date_ending < b.fiscal_date_ending
        ? 1
        : -1
      : a.period_type === 'annual'
        ? -1
        : 1,
  );
  const latest = (concept, unit) => {
    const es = (dei[concept]?.units?.[unit] ?? [])
      .filter((e) => e.val !== null && e.val !== undefined)
      .sort((a, b) => (String(a.end) < String(b.end) ? 1 : -1));
    return es[0] ? { val: num(es[0].val), end: es[0].end } : null;
  };
  return {
    periods: out,
    sharesOutstanding: latest('EntityCommonStockSharesOutstanding', 'shares'),
    publicFloat: latest('EntityPublicFloat', 'USD'),
    entityName: facts?.entityName ?? null,
  };
}

/** submissions JSON → company header fields. */
export function parseSubmissions(sub) {
  if (!sub) return null;
  return {
    name: sub.name ?? null,
    sic: sub.sic ?? null,
    industry: sub.sicDescription ?? null,
    sector: sectorFromSic(sub.sic),
    exchange: (sub.exchanges ?? [])[0] ?? null,
    tickers: sub.tickers ?? [],
    fiscalYearEnd: sub.fiscalYearEnd ?? null,
    stateOfIncorporation: sub.stateOfIncorporation ?? null,
    entityType: sub.entityType ?? null,
    category: sub.category ?? null,
    cik: sub.cik ? cik10(sub.cik) : null,
  };
}
