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
 * Latest NPORT-P for a series via EDGAR full-text search (the submissions list of a multi-series trust
 * mixes dozens of series; FTS finds the one document mentioning this series ID). Sorted by file date.
 */
export async function findLatestNportBySeries(seriesId, { offline = false } = {}) {
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${seriesId}"`)}&forms=NPORT-P`;
  const { body } = await cachedGet('sec', url, { headers: headers(), limiter, offline });
  const hits = body?.hits?.hits ?? [];
  const sorted = hits
    .map((h) => ({
      adsh: h._source?.adsh,
      filed: h._source?.file_date,
      periodEnding: h._source?.period_ending ?? null,
      ciks: h._source?.ciks ?? [],
      doc: String(h._id ?? '').split(':')[1] || 'primary_doc.xml',
    }))
    .filter((h) => h.adsh && h.filed)
    .sort((a, b) => (a.filed < b.filed ? 1 : -1));
  return sorted[0] ?? null;
}

/**
 * Fetch an NPORT-P primary document. Series-based trusts (e.g., Vanguard) file one NPORT-P per series;
 * full-text search locates the latest for the series; falls back to scanning the CIK's recent filings.
 */
export async function fetchNportForSeries(cik, seriesId, { offline = false, maxScan = 12 } = {}) {
  if (seriesId) {
    const hit = await findLatestNportBySeries(seriesId, { offline });
    if (hit) {
      const acc = hit.adsh.replace(/-/g, '');
      const cikNum = Number(hit.ciks[0] ?? cik);
      const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${hit.doc}`;
      const { body } = await cachedGet('sec', url, {
        headers: headers(),
        limiter,
        offline,
        parse: 'text',
      });
      const parsed = body ? parseNport(body) : null;
      if (parsed && (!parsed.seriesId || parsed.seriesId === seriesId))
        return { ...parsed, accession: hit.adsh, filed: hit.filed, url };
    }
  }
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
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeXml = (t) =>
  t === null || t === undefined
    ? t
    : String(t).replace(/&(amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (m, name, dec, hex) =>
        dec
          ? String.fromCodePoint(Number(dec))
          : hex
            ? String.fromCodePoint(parseInt(hex, 16))
            : (ENT[name.toLowerCase()] ?? m),
      );
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : null;
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
    const issuerCat = tag(h, 'issuerCat');
    const country = tag(h, 'invCountry');
    if (pctVal === null) continue;
    // Tickers in filings are LOCAL exchange symbols; suffix non-US listings with the country so Siemens Energy
    // (Xetra ENR) never merges with Energizer (NYSE ENR). US = invCountry US or ISIN starting with US.
    let sym = normalizeTicker(ticker);
    const isUS =
      country === 'US' ||
      (isin && isin !== 'N/A' && String(isin).startsWith('US')) ||
      (!country && !isin);
    if (sym && !isUS) sym = `${sym}.${country ?? String(isin).slice(0, 2)}`;
    // Prefer the issuer name; keep the security title only when it adds information (a bond's coupon/maturity)
    const N = String(name).toUpperCase();
    const T = String(title ?? '').toUpperCase();
    const label =
      title && title !== name && !T.startsWith(N) && !N.startsWith(T) ? `${name} — ${title}` : name;
    holdings.push({
      name: label.trim(),
      cusip: cusip && cusip !== 'N/A' && cusip !== '000000000' ? cusip : '',
      isin: isin && isin !== 'N/A' ? isin : null,
      symbol: sym,
      country: country ?? null,
      weight: pctVal / 100, // pctVal is a percent of net assets
      valueUsd: valUSD,
      assetCat,
      issuerCat,
    });
  }
  return { seriesId, seriesName, reportDate, netAssets, holdings };
}

/** Collapse an N-PORT holding list to equity-like positions, merge duplicates, cap at maxHoldings. */
export function condenseHoldings(holdings, { maxHoldings = 250 } = {}) {
  const merged = new Map();
  for (const h of holdings) {
    if (h.weight <= 0) continue;
    const key =
      h.symbol ||
      (h.cusip ? `cusip:${h.cusip}` : '') ||
      (h.isin ? `isin:${h.isin}` : '') ||
      `name:${h.name}`;
    const cur = merged.get(key);
    if (cur) ((cur.weight += h.weight), (cur.valueUsd = (cur.valueUsd ?? 0) + (h.valueUsd ?? 0)));
    else merged.set(key, { ...h });
  }
  return [...merged.values()].sort((a, b) => b.weight - a.weight).slice(0, maxHoldings);
}
