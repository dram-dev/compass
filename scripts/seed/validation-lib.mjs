/**
 * Pure helpers for the validation harness (docs/PLAN-political-axes.md, Phases B and D):
 * CSV in/out, Spearman ρ, Cohen's κ, stratified company sampling, position-coding item selection.
 * No I/O here — validate-political.mjs wires them to the DB and files.
 */

// ------------------------------------------------------------------ CSV (RFC 4180-ish)
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const src = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows, columns) {
  return (
    [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') +
    '\n'
  );
}

// ------------------------------------------------------------------ statistics
function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1; // average rank for ties
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}
/** Spearman rank correlation over paired finite numbers (ties → average ranks). null when n < 3. */
export function spearman(xs, ys) {
  const pairs = xs
    .map((x, i) => [x, ys[i]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;
  if (n < 3) return { rho: null, n };
  const rx = ranks(pairs.map((p) => p[0]));
  const ry = ranks(pairs.map((p) => p[1]));
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return { rho: sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null, n };
}
/** Cohen's κ for two raters over paired categorical labels (pairs with a missing label are skipped). */
export function cohenKappa(a, b) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x && y);
  const n = pairs.length;
  if (!n) return { kappa: null, agreement: null, n: 0, confusion: {} };
  const cats = [...new Set(pairs.flat())].sort();
  const confusion = {};
  for (const c of cats) confusion[c] = Object.fromEntries(cats.map((d) => [d, 0]));
  let agree = 0;
  for (const [x, y] of pairs) {
    confusion[x][y]++;
    if (x === y) agree++;
  }
  const po = agree / n;
  let pe = 0;
  for (const c of cats) {
    const pa = pairs.filter((p) => p[0] === c).length / n;
    const pb = pairs.filter((p) => p[1] === c).length / n;
    pe += pa * pb;
  }
  const kappa = pe === 1 ? 1 : +((po - pe) / (1 - pe)).toFixed(3);
  return { kappa, agreement: +po.toFixed(3), n, confusion };
}

// ------------------------------------------------------------------ Phase B sample
const pctR = (s) => (s && s.D + s.R > 0 ? +((100 * s.R) / (s.D + s.R)).toFixed(1) : null);
/**
 * 40 companies: `brandCount` sample brands (most partisan $, mixing PAC / no-PAC) + `heldCount` top-held
 * companies round-robin across sectors by AUM rank, reserving `noPacSlots` for companies without a PAC.
 *   facts: political-facts companies (with streams)  ·  held: [{symbol, name, sector, aumRank}] in AUM order
 */
export function stratifiedSample(
  facts,
  held,
  brandTickers,
  { brandCount = 10, heldCount = 30, noPacSlots = 8 } = {},
) {
  const by = new Map(facts.map((f) => [f.symbol, f]));
  const hasPac = (s) => (by.get(s)?.streams?.pac?.partisanUsd ?? 0) >= 5000;
  const partisan = (s) => by.get(s)?.lean?.totalPartisanUsd ?? 0;
  const brands = brandTickers.filter((t) => by.has(t) && !by.get(t).sameAs);
  const brandPac = brands.filter(hasPac).sort((a, b) => partisan(b) - partisan(a));
  const brandNoPac = brands.filter((t) => !hasPac(t)).sort((a, b) => partisan(b) - partisan(a));
  const wantNoPacBrands = Math.min(3, brandNoPac.length);
  const picked = [
    ...brandPac.slice(0, brandCount - wantNoPacBrands),
    ...brandNoPac.slice(0, wantNoPacBrands),
  ].slice(0, brandCount);
  const chosen = new Set(picked);
  const rows = picked.map((s) => ({ symbol: s, stratum: 'brand' }));
  // top-held: sectors round-robin
  const eligible = held.filter(
    (h) => by.has(h.symbol) && !by.get(h.symbol).sameAs && !chosen.has(h.symbol),
  );
  const noPac = eligible.filter((h) => !hasPac(h.symbol)).slice(0, noPacSlots);
  for (const h of noPac) {
    chosen.add(h.symbol);
    rows.push({ symbol: h.symbol, stratum: 'held' });
  }
  const bySector = new Map();
  for (const h of eligible) {
    if (chosen.has(h.symbol) || !hasPac(h.symbol)) continue;
    const k = h.sector ?? '(none)';
    (bySector.get(k) ?? bySector.set(k, []).get(k)).push(h);
  }
  const sectors = [...bySector.keys()].sort(
    (a, b) => bySector.get(b).length - bySector.get(a).length,
  );
  while (rows.length < brandCount + heldCount && sectors.some((k) => bySector.get(k).length)) {
    for (const k of sectors) {
      const next = bySector.get(k).shift();
      if (!next) continue;
      chosen.add(next.symbol);
      rows.push({ symbol: next.symbol, stratum: 'held' });
      if (rows.length >= brandCount + heldCount) break;
    }
  }
  const heldBy = new Map(held.map((h) => [h.symbol, h]));
  return rows.map((r) => {
    const f = by.get(r.symbol);
    const h = heldBy.get(r.symbol);
    return {
      symbol: r.symbol,
      name: f.name,
      stratum: r.stratum,
      sector: h?.sector ?? '',
      aumRank: h?.aumRank ?? '',
      hasPac: pctR(f.streams?.pac) !== null ? 'yes' : 'no',
      our_pac_pctR: pctR(f.streams?.pac),
      our_exec_pctR: pctR(f.streams?.executive),
      our_employee_pctR: pctR(f.streams?.employee),
      our_pooled_pctR:
        f.lean?.r === null || f.lean?.r === undefined
          ? null
          : +((100 * (1 + f.lean.r)) / 2).toFixed(1),
      our_lean: f.lean?.leanScore ?? '',
    };
  });
}

// ------------------------------------------------------------------ Phase D items
export const POSITION_CODES = ['TAR', 'TRD', 'TAX', 'BUD', 'LBR', 'CPT'];
const RELEVANT_TOPICS = new Set([
  'tariff',
  'tariff-exclusion',
  'domestic-content',
  'subsidy',
  'antitrust',
  'procurement',
  'licensing-certification',
  'trade-agreement',
]);
const normText = (t) =>
  String(t ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Deterministic 32-bit hash for a stable shuffle. */
export const hash32 = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};
/**
 * Pick rating items: one item = one lobbying activity (code + specific-issue text) from a filing.
 *   activities: [{ symbol, company, filing_uuid, year, period, registrant, kind, code, codeDisplay, text, topics[], url }]
 * Priority: TAR/TRD code 3 · relevant keyword topic 2 · other 1. Dedupe by normalized text across the whole
 * sample; ≤ perCompany items per company; ≤ total overall; order shuffled by hash so companies are interleaved.
 */
export function pickPositionItems(activities, { perCompany = 6, total = 240, minChars = 40 } = {}) {
  const seen = new Set();
  const scored = [];
  for (const a of activities) {
    if (!POSITION_CODES.includes(a.code)) continue;
    const t = normText(a.text);
    if (t.length < minChars || seen.has(t)) continue;
    seen.add(t);
    const rel = (a.topics ?? []).filter((x) => RELEVANT_TOPICS.has(x));
    const priority = a.code === 'TAR' || a.code === 'TRD' ? 3 : rel.length ? 2 : 1;
    scored.push({ ...a, priority, relevantTopics: rel });
  }
  scored.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.relevantTopics.length - a.relevantTopics.length ||
      (b.year ?? 0) - (a.year ?? 0) ||
      String(a.text).length - String(b.text).length,
  );
  const perCo = new Map();
  const picked = [];
  for (const a of scored) {
    const n = perCo.get(a.symbol) ?? 0;
    if (n >= perCompany) continue;
    perCo.set(a.symbol, n + 1);
    picked.push(a);
    if (picked.length >= total) break;
  }
  return picked
    .map((a) => ({
      id: `${a.filing_uuid}:${a.code}:${hash32(normText(a.text)).toString(16)}`,
      symbol: a.symbol,
      company: a.company,
      code: a.code,
      codeDisplay: a.codeDisplay ?? a.code,
      year: a.year,
      period: a.period,
      registrant: a.registrant,
      kind: a.kind,
      topics: a.topics ?? [],
      text: String(a.text).slice(0, 1500),
      url: a.url ?? null,
    }))
    .sort((x, y) => hash32(x.id) - hash32(y.id))
    .map((it, i) => ({ order: i + 1, ...it }));
}
