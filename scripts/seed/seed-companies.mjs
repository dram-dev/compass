import { CONFIG } from './config.mjs';
import { log, now, upsertCompany, upsertPeriod } from './db.mjs';
import {
  fetchBalance,
  fetchCashFlow,
  fetchIncome,
  fetchOverview,
  parseOverview,
  parseStatements,
} from './alphavantage.mjs';
import { ThrottledError } from './http.mjs';
import { SAMPLE_TICKERS } from './sample-tickers.mjs';
import {
  fetchCompanyFacts,
  fetchSubmissions,
  loadTickerCikMap,
  parseCompanyFacts,
  parseSubmissions,
} from './sec-xbrl.mjs';

/**
 * Which companies to seed, in priority order: (1) tickers behind Compass's shipped sample brands,
 * (2) holdings of the top-N funds ordered by AUM-weighted concentration. Only US-listed-looking
 * tickers (letters/dots/hyphens, ≤ 5 chars) go to Alpha Vantage.
 */
export function companyQueue(db, { topN = CONFIG.topN } = {}) {
  const rows = db
    .prepare(
      `
    SELECT h.holding_symbol AS symbol, SUM(h.weight * COALESCE(f.net_assets,0)) AS aum
    FROM fund_holding_effective h JOIN fund f ON f.symbol = h.fund_symbol
    WHERE h.holding_symbol IS NOT NULL AND f.popularity_rank IS NOT NULL AND f.popularity_rank <= ? AND f.proxy_of IS NULL
      AND (h.issuer_cat IS NULL OR h.issuer_cat = 'CORP') AND (h.asset_cat IS NULL OR h.asset_cat IN ('EC','EP','DBT'))
    GROUP BY h.holding_symbol ORDER BY aum DESC`,
    )
    .all(topN);
  const seen = new Set();
  const out = [];
  for (const t of [...SAMPLE_TICKERS, ...rows.map((r) => r.symbol)]) {
    const s = String(t).toUpperCase();
    if (seen.has(s) || !/^[A-Z][A-Z0-9]{0,4}(-[A-Z])?$/.test(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Step 2 — companies. OVERVIEW for the first `overviewLimit` symbols; INCOME/BALANCE/CASH_FLOW
 * for the first `statementsLimit`. Symbols already in `company` are skipped unless `refresh`.
 */
export async function seedCompanies(
  db,
  {
    overviewLimit = 300,
    statementsLimit = 50,
    offline = false,
    refresh = false,
    log: out = console.log,
    only = null,
  } = {},
) {
  const queue = only ?? companyQueue(db);
  const summary = {
    overview: 0,
    statements: 0,
    cached: 0,
    skipped: 0,
    throttled: false,
    errors: [],
  };
  const have = new Set(
    db
      .prepare('SELECT symbol FROM company')
      .all()
      .map((r) => r.symbol),
  );
  const haveStatements = new Set(
    db
      .prepare('SELECT DISTINCT symbol FROM financial_period')
      .all()
      .map((r) => r.symbol),
  );
  let i = 0;
  for (const symbol of queue) {
    if (i >= overviewLimit) break;
    i++;
    const wantStatements = i <= statementsLimit;
    try {
      if (refresh || !have.has(symbol)) {
        const r = await fetchOverview(symbol, { offline });
        if (!r.body) {
          summary.skipped++;
          continue;
        }
        const c = parseOverview(r.body, now());
        if (!c) {
          log(db, 'alphavantage', 'OVERVIEW', symbol, 'empty');
          summary.skipped++;
          continue;
        }
        upsertCompany(db, c);
        log(db, 'alphavantage', 'OVERVIEW', symbol, r.cached ? 'cached' : 'ok');
        r.cached ? summary.cached++ : summary.overview++;
        out(
          `  CO  ${symbol.padEnd(6)} ${r.cached ? '(cache)' : '(fetch)'} ${c.name} · ${c.sector ?? '?'}`,
        );
      }
      if (wantStatements && (refresh || !haveStatements.has(symbol))) {
        const [inc, bal, cf] = [
          await fetchIncome(symbol, { offline }),
          await fetchBalance(symbol, { offline }),
          await fetchCashFlow(symbol, { offline }),
        ];
        if (inc.body || bal.body || cf.body) {
          const periods = parseStatements(
            symbol,
            { income: inc.body, balance: bal.body, cashflow: cf.body },
            now(),
          );
          db.exec('BEGIN');
          try {
            for (const p of periods) upsertPeriod(db, p);
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
          log(db, 'alphavantage', 'STATEMENTS', symbol, 'ok', `${periods.length} periods`);
          summary.statements++;
          out(`      ${symbol.padEnd(6)} statements: ${periods.length} periods`);
        }
      }
    } catch (e) {
      if (e instanceof ThrottledError) {
        out(
          `! Alpha Vantage throttled at ${symbol}: ${e.message}\n  Progress is cached — re-run later to continue.`,
        );
        log(db, 'alphavantage', 'COMPANY', symbol, 'throttled', e.message);
        summary.throttled = true;
        break;
      }
      log(db, 'alphavantage', 'COMPANY', symbol, 'error', String(e.message));
      summary.errors.push(`${symbol}: ${e.message}`);
      out(`  CO  ${symbol} error: ${e.message}`);
    }
  }
  return summary;
}

/**
 * Step 2a — companies from SEC filings (no key): submissions (name, SIC industry/sector, exchange) and XBRL
 * companyfacts (annual + quarterly statements) for the queue. Alpha Vantage remains an enrichment layer.
 */
export async function seedCompaniesSec(
  db,
  {
    limit = 300,
    statementsLimit = 300,
    offline = false,
    refresh = false,
    log: out = console.log,
    only = null,
  } = {},
) {
  const queue = only ?? companyQueue(db);
  const summary = { companies: 0, periods: 0, noCik: 0, skipped: 0, errors: [] };
  const map = await loadTickerCikMap({ offline });
  if (!map) {
    out('! SEC ticker map unavailable');
    return summary;
  }
  const have = new Set(
    db
      .prepare("SELECT symbol FROM company WHERE source LIKE '%sec-xbrl%'")
      .all()
      .map((r) => r.symbol),
  );
  let i = 0;
  for (const symbol of queue) {
    if (i >= limit) break;
    i++;
    if (!refresh && have.has(symbol)) {
      summary.skipped++;
      continue;
    }
    const hit = map.get(symbol);
    if (!hit) {
      summary.noCik++;
      log(db, 'sec', 'companyfacts', symbol, 'empty', 'no CIK for ticker');
      continue;
    }
    try {
      const sub = parseSubmissions(await fetchSubmissions(hit.cik, { offline }));
      let parsed = null;
      if (i <= statementsLimit)
        parsed = parseCompanyFacts(symbol, await fetchCompanyFacts(hit.cik, { offline }), now());
      upsertCompany(db, {
        symbol,
        name: sub?.name ?? parsed?.entityName ?? hit.title,
        exchange: sub?.exchange ?? null,
        currency: 'USD',
        country: 'USA',
        sector: sub?.sector ?? null,
        industry: sub?.industry ?? null,
        cik: sub?.cik ?? hit.cik,
        fiscal_year_end: sub?.fiscalYearEnd ?? null,
        sic: sub?.sic ?? null,
        public_float: parsed?.publicFloat?.val ?? null,
        shares_outstanding: parsed?.sharesOutstanding?.val ?? null,
        shares_asof: parsed?.sharesOutstanding?.end ?? null,
        source: 'sec-xbrl',
        fetched_at: now(),
      });
      if (parsed?.periods.length) {
        db.exec('BEGIN');
        try {
          for (const p of parsed.periods) upsertPeriod(db, p);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        summary.periods += parsed.periods.length;
      }
      summary.companies++;
      log(
        db,
        'sec',
        'companyfacts',
        symbol,
        'ok',
        `${parsed?.periods.length ?? 0} periods · SIC ${sub?.sic ?? '?'}`,
      );
      out(
        `  SEC ${symbol.padEnd(6)} ${String(sub?.name ?? '')
          .slice(0, 34)
          .padEnd(
            34,
          )} ${String(sub?.sector ?? '?').padEnd(28)} periods=${parsed?.periods.length ?? 0}`,
      );
    } catch (e) {
      summary.errors.push(`${symbol}: ${e.message}`);
      log(db, 'sec', 'companyfacts', symbol, 'error', String(e.message));
      out(`  SEC ${symbol} error: ${e.message}`);
    }
  }
  return summary;
}
