/**
 * SEC EDGAR helpers for mutual-fund holdings (Form N-PORT). Free, no key; requires a descriptive
 * User-Agent. Flow: ticker → (cik, seriesId, classId) via company_tickers_mf.json → latest NPORT-P
 * filing index for the CIK → primary_doc.xml for the matching series → parse holdings.
 */
import { CONFIG } from './config.mjs';
import { cachedGet, makeLimiter } from './http.mjs';
import { num } from './db.mjs';
import { normalizeTicker } from './alphavantage.mjs';

const limiter = makeLimiter(CONFIG.sec.perSecond, 1000);
const headers = () => ({ 'User-Agent': CONFIG.sec.userAgent, 'Accept-Encoding': 'gzip, deflate' });

/** company_tickers_mf.json → { fields:[cik,seriesId,classId,symbol], data:[[...]] } */
export async function loadMutualFundTickerMap({ offline = false } = {}) {
  const { body } = await cachedGet('sec', CONFIG.sec.tickersUrl, {
    headers: headers(),
    limiter,
    offline,
  });
  if (!body) return null;
  return parseTickerMap(body);
}
export function parseTickerMap(body) {
  const f = body.fields ?? ['cik', 'seriesId', 'classId', 'symbol'];
  const idx = Object.fromEntries(f.map((k, i) => [k, i]));
  const out = new Map();
  for (const row of body.data ?? []) {
    const sym = String(row[idx.symbol] ?? '').toUpperCase();
    if (!sym) continue;
    out.set(sym, {
      cik: String(row[idx.cik]).padStart(10, '0'),
      seriesId: row[idx.seriesId],
      classId: row[idx.classId],
    });
  }
  return out;
}

/** Latest NPORT-P accession for a CIK via the submissions JSON. */
export async function latestNportAccession(cik, { offline = false } = {}) {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const { body } = await cachedGet('sec', url, { headers: headers(), limiter, offline });
  if (!body) return null;
  return pickLatestNport(body);
}
export function pickLatestNport(subs) {
  const r = subs?.filings?.recent;
  if (!r) return null;
  const out = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === 'NPORT-P')
      out.push({
        accession: r.accessionNumber[i],
        filed: r.filingDate[i],
        reportDate: r.reportDate?.[i] ?? null,
        primary: r.primaryDocument?.[i] ?? 'primary_doc.xml',
      });
  }
  out.sort((a, b) => (a.filed < b.filed ? 1 : -1));
  return out;
}

/**
 * Fetch an NPORT-P primary document. Series-based trusts (e.g., Vanguard) file one NPORT-P per series;
 * the submissions list mixes them, so we scan recent filings until the seriesId matches.
 */
export async function fetchNportForSeries(cik, seriesId, { offline = false, maxScan = 12 } = {}) {
  const filings = await latestNportAccession(cik, { offline });
  if (!filings) return null;
  for (const f of filings.slice(0, maxScan)) {
    const acc = f.accession.replace(/-/g, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${f.primary}`;
    const { body } = await cachedGet('sec', url, {
      headers: headers(),
      limiter,
      offline,
      parse: 'text',
    });
    if (!body) continue;
    const parsed = parseNport(body);
    if (!parsed) continue;
    if (!seriesId || parsed.seriesId === seriesId)
      return { ...parsed, accession: f.accession, filed: f.filed, url };
  }
  return null;
}

// ------------------------------------------------------------------ pure XML parsing (no deps)
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : null;
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
};

/** Parse an N-PORT primary_doc.xml → { seriesId, seriesName, reportDate, netAssets, holdings[] } */
export function parseNport(xml) {
  if (!xml || !/<edgarSubmission|<formData/i.test(xml)) return null;
  const seriesId = tag(xml, 'seriesId');
  const seriesName = tag(xml, 'seriesName');
  const reportDate = tag(xml, 'repPdDate') ?? tag(xml, 'repPdEnd');
  const netAssets = num(tag(xml, 'netAssets'));
  const holdings = [];
  const re = /<invstOrSec>([\s\S]*?)<\/invstOrSec>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const h = m[1];
    const name = tag(h, 'name') ?? tag(h, 'title') ?? 'UNKNOWN';
    const title = tag(h, 'title');
    const cusip = tag(h, 'cusip');
    const isin = attr(h, 'isin', 'value') ?? tag(h, 'isin');
    const ticker = attr(h, 'ticker', 'value') ?? tag(h, 'ticker');
    const valUSD = num(tag(h, 'valUSD'));
    const pctVal = num(tag(h, 'pctVal'));
    const assetCat = tag(h, 'assetCat');
    if (pctVal === null) continue;
    holdings.push({
      name: (title && title !== name ? `${name} — ${title}` : name).trim(),
      cusip: cusip && cusip !== 'N/A' && cusip !== '000000000' ? cusip : '',
      isin: isin && isin !== 'N/A' ? isin : null,
      symbol: normalizeTicker(ticker),
      weight: pctVal / 100, // pctVal is a percent of net assets
      valueUsd: valUSD,
      assetCat,
    });
  }
  return { seriesId, seriesName, reportDate, netAssets, holdings };
}

/** Collapse an N-PORT holding list to equity-like positions, merge duplicates, cap at maxHoldings. */
export function condenseHoldings(holdings, { maxHoldings = 250 } = {}) {
  const merged = new Map();
  for (const h of holdings) {
    if (h.weight <= 0) continue;
    const key = h.symbol ?? h.cusip ?? h.name;
    const cur = merged.get(key);
    if (cur) ((cur.weight += h.weight), (cur.valueUsd = (cur.valueUsd ?? 0) + (h.valueUsd ?? 0)));
    else merged.set(key, { ...h });
  }
  return [...merged.values()].sort((a, b) => b.weight - a.weight).slice(0, maxHoldings);
}
