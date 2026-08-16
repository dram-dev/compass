import { readFileSync } from 'node:fs';
import { CONFIG, requireAlphaVantageKey } from './config.mjs';
import { log, now, replaceHoldings, upsertFund } from './db.mjs';
import { fetchEtfProfile, parseEtfProfile } from './alphavantage.mjs';
import { ThrottledError } from './http.mjs';
import { condenseHoldings, fetchNportForSeries, loadMutualFundTickerMap } from './sec.mjs';

export function loadUniverse() {
  return JSON.parse(readFileSync(CONFIG.universePath, 'utf8')).funds;
}

/**
 * Step 1 — funds. ETFs: Alpha Vantage ETF_PROFILE (net assets, expense ratio, holdings).
 * Mutual funds: SEC N-PORT for net assets + holdings when SEC_USER_AGENT is set; index funds fall
 * back to their ETF proxy's holdings. Resumable: every response is cached on disk.
 */
export async function seedFunds(
  db,
  { limit = Infinity, offline = false, only = null, log: out = console.log } = {},
) {
  const universe = loadUniverse().filter((f) => !only || only.includes(f.symbol));
  const summary = {
    etfOk: 0,
    etfCached: 0,
    mfNport: 0,
    mfProxy: 0,
    skipped: 0,
    throttled: false,
    errors: [],
  };
  const etfs = universe.filter((f) => f.kind === 'etf').slice(0, limit);
  const useAv = !!CONFIG.alphaVantage.key;
  if (!useAv && !offline)
    out('! ALPHAVANTAGE_API_KEY not set — ETF profiles will only come from cache.');

  for (const f of etfs) {
    try {
      const r = await fetchEtfProfile(f.symbol, { offline: offline || !useAv });
      if (!r.body) {
        summary.skipped++;
        continue;
      }
      const p = parseEtfProfile(r.body, { maxHoldings: CONFIG.maxHoldingsPerFund });
      if (!p) {
        log(db, 'alphavantage', 'ETF_PROFILE', f.symbol, 'empty');
        summary.skipped++;
        continue;
      }
      upsertFund(db, {
        symbol: f.symbol,
        name: f.name,
        kind: 'etf',
        family: f.family ?? null,
        category: f.category ?? null,
        net_assets: p.meta.net_assets,
        expense_ratio: p.meta.expense_ratio,
        dividend_yield: p.meta.dividend_yield,
        inception_date: p.meta.inception_date,
        holdings_source: 'alphavantage:ETF_PROFILE',
        holdings_as_of: r.cachedAt?.slice(0, 10) ?? now().slice(0, 10),
        proxy_of: null,
        sec_cik: null,
        sec_series_id: null,
        sec_class_id: null,
        popularity_rank: null,
        raw_json: JSON.stringify({ meta: p.meta }),
        fetched_at: now(),
      });
      replaceHoldings(db, f.symbol, p.holdings, 'alphavantage:ETF_PROFILE');
      log(
        db,
        'alphavantage',
        'ETF_PROFILE',
        f.symbol,
        r.cached ? 'cached' : 'ok',
        `${p.holdings.length} holdings`,
      );
      r.cached ? summary.etfCached++ : summary.etfOk++;
      out(
        `  ETF ${f.symbol.padEnd(6)} ${r.cached ? '(cache)' : '(fetch)'} holdings=${p.holdings.length} netAssets=${p.meta.net_assets ?? '?'}`,
      );
    } catch (e) {
      if (e instanceof ThrottledError) {
        out(
          `! Alpha Vantage throttled at ${f.symbol}: ${e.message}\n  Progress is cached — re-run later to continue.`,
        );
        log(db, 'alphavantage', 'ETF_PROFILE', f.symbol, 'throttled', e.message);
        summary.throttled = true;
        break;
      }
      log(db, 'alphavantage', 'ETF_PROFILE', f.symbol, 'error', String(e.message));
      summary.errors.push(`${f.symbol}: ${e.message}`);
      out(`  ETF ${f.symbol} error: ${e.message}`);
    }
  }

  // ---- mutual funds
  const mfs = universe.filter((f) => f.kind === 'mutual').slice(0, limit);
  let tickerMap = null;
  if (CONFIG.sec.userAgent || offline) {
    try {
      tickerMap = await loadMutualFundTickerMap({ offline });
    } catch (e) {
      out(`! SEC ticker map unavailable: ${e.message}`);
    }
  } else if (mfs.length) {
    out(
      '! SEC_USER_AGENT not set — mutual-fund holdings will use ETF proxies only (index funds); active funds are skipped.',
    );
  }

  for (const f of mfs) {
    let done = false;
    const ids = tickerMap?.get(f.symbol) ?? null;
    if (ids) {
      try {
        const np = await fetchNportForSeries(ids.cik, ids.seriesId, { offline });
        if (np) {
          const holdings = condenseHoldings(np.holdings, {
            maxHoldings: CONFIG.maxHoldingsPerFund,
          });
          upsertFund(db, {
            symbol: f.symbol,
            name: f.name,
            kind: 'mutual',
            family: f.family ?? null,
            category: f.category ?? null,
            net_assets: np.netAssets,
            expense_ratio: null,
            dividend_yield: null,
            inception_date: null,
            holdings_source: 'sec:NPORT-P',
            holdings_as_of: np.reportDate,
            proxy_of: f.proxyKind === 'share-class' ? f.proxy : null,
            sec_cik: ids.cik,
            sec_series_id: ids.seriesId,
            sec_class_id: ids.classId,
            popularity_rank: null,
            raw_json: JSON.stringify({
              seriesName: np.seriesName,
              accession: np.accession,
              filed: np.filed,
              url: np.url,
            }),
            fetched_at: now(),
          });
          replaceHoldings(
            db,
            f.symbol,
            holdings.map((h) => ({ ...h, asOf: np.reportDate })),
            'sec:NPORT-P',
          );
          log(
            db,
            'sec',
            'NPORT-P',
            f.symbol,
            'ok',
            `${holdings.length} holdings · ${np.accession}`,
          );
          summary.mfNport++;
          out(
            `  MF  ${f.symbol.padEnd(6)} N-PORT ${np.reportDate} holdings=${holdings.length} netAssets=${np.netAssets ?? '?'}`,
          );
          done = true;
        }
      } catch (e) {
        log(db, 'sec', 'NPORT-P', f.symbol, 'error', String(e.message));
        out(`  MF  ${f.symbol} N-PORT error: ${e.message}`);
      }
    }
    if (!done && f.proxy) {
      const proxyHoldings = db
        .prepare(
          'SELECT holding_symbol AS symbol, holding_name AS name, cusip, isin, weight, as_of AS asOf FROM fund_holding WHERE fund_symbol = ?',
        )
        .all(f.proxy);
      if (proxyHoldings.length) {
        upsertFund(db, {
          symbol: f.symbol,
          name: f.name,
          kind: 'mutual',
          family: f.family ?? null,
          category: f.category ?? null,
          net_assets: null,
          expense_ratio: null,
          dividend_yield: null,
          inception_date: null,
          holdings_source: `proxy:${f.proxy}`,
          holdings_as_of: proxyHoldings[0].asOf ?? null,
          proxy_of: f.proxy,
          sec_cik: ids?.cik ?? null,
          sec_series_id: ids?.seriesId ?? null,
          sec_class_id: ids?.classId ?? null,
          popularity_rank: null,
          raw_json: JSON.stringify({ proxyKind: f.proxyKind }),
          fetched_at: now(),
        });
        replaceHoldings(db, f.symbol, proxyHoldings, `proxy:${f.proxy}`);
        log(db, 'proxy', f.proxy, f.symbol, 'ok', `${proxyHoldings.length} holdings copied`);
        summary.mfProxy++;
        out(`  MF  ${f.symbol.padEnd(6)} proxy ${f.proxy} holdings=${proxyHoldings.length}`);
        done = true;
      }
    }
    if (!done) {
      summary.skipped++;
      log(db, 'sec', 'NPORT-P', f.symbol, 'empty', 'no holdings source available');
    }
  }
  return summary;
}

/** Step 1b — popularity rank by net assets (share-class duplicates inherit their ETF's rank). */
export function rankFunds(db, topN = CONFIG.topN) {
  db.exec('UPDATE fund SET popularity_rank = NULL');
  const ranked = db
    .prepare(
      `SELECT symbol FROM fund WHERE net_assets IS NOT NULL AND (proxy_of IS NULL OR holdings_source LIKE 'sec:%') ORDER BY net_assets DESC`,
    )
    .all();
  const upd = db.prepare('UPDATE fund SET popularity_rank = ? WHERE symbol = ?');
  ranked.forEach((r, i) => upd.run(i + 1, r.symbol));
  // share-class proxies inherit
  const inherit =
    db.prepare(`UPDATE fund SET popularity_rank = (SELECT p.popularity_rank FROM fund p WHERE p.symbol = fund.proxy_of)
    WHERE popularity_rank IS NULL AND proxy_of IS NOT NULL`);
  inherit.run();
  const inTop = db.prepare('SELECT COUNT(*) AS n FROM fund WHERE popularity_rank <= ?').get(topN).n;
  return { ranked: ranked.length, inTop, topN };
}
