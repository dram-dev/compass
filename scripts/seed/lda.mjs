/**
 * Senate Lobbying Disclosure Act API (https://lda.gov/api/redoc/v1/). Anonymous access is throttled
 * (~15 req/min); a free registered key (Authorization: Token …) raises it. Every response is cached.
 */
import { CONFIG } from './config.mjs';
import { cachedGet, makeLimiter } from './http.mjs';
import { matchOrg, normOrg } from './orgmatch.mjs';

export const LDA_BASE = 'https://lda.gov/api/v1';
const key = () => process.env.LDA_API_KEY ?? '';
const limiter = makeLimiter(key() ? 100 : 15, 60_000); // documented anonymous ceiling: 15/min
const headers = () => ({
  Accept: 'application/json',
  ...(key() ? { Authorization: `Token ${key()}` } : {}),
});

async function ldaGet(pathAndQuery, opts = {}) {
  const url = `${LDA_BASE}/${pathAndQuery}`;
  const { body } = await cachedGet('lda', url, {
    headers: headers(),
    limiter,
    offline: opts.offline,
    retries: 4,
  });
  return body;
}

/** Search clients by each alias; keep results whose name matches the alias index for that symbol. */
export async function findClients(
  symbol,
  aliases,
  aliasIndex,
  { offline = false, overrides = {} } = {},
) {
  const found = new Map(); // clientId → { id, name, method }
  const forced = new Map();
  const excluded = new Set();
  for (const id of overrides.ldaClients?.[symbol] ?? [])
    String(id).startsWith('!')
      ? excluded.add(Number(String(id).slice(1)))
      : forced.set(Number(id), 'override');
  // The client_name filter is a substring match, so only "root" aliases (not containing a shorter alias
  // of the same company) need to be searched: AMAZON covers AMAZON COM SERVICES; AWS and ZAPPOS are roots.
  const norms = [...new Set(aliases.map((a) => normOrg(a)).filter((q) => q.length >= 3))];
  const roots = norms.filter((q) => !norms.some((o) => o !== q && q.includes(o)));
  for (const q of roots) {
    let page = 1;
    while (page <= 5) {
      const body = await ldaGet(
        `clients/?client_name=${encodeURIComponent(q)}&page_size=100&page=${page}`,
        { offline },
      );
      if (!body) break;
      for (const c of body.results ?? []) {
        if (excluded.has(c.id)) continue;
        const m = forced.has(c.id) ? { symbol, method: 'override' } : matchOrg(c.name, aliasIndex);
        if (m && m.symbol === symbol && m.method !== 'exact-ambiguous')
          found.set(c.id, { id: c.id, name: c.name, method: m.method });
      }
      if (!body.next) break;
      page++;
    }
  }
  for (const [id] of forced)
    if (!found.has(id)) found.set(id, { id, name: `(override ${id})`, method: 'override' });
  return [...found.values()];
}

/**
 * All filings for a set of matched clients in the given years. The `client_name` filter spans every
 * registrant's client record with that name, so one query per distinct name × year replaces one per
 * client id × year (Apple: 26 client rows → ~7 names). Results are filtered back to the matched ids.
 */
export async function fetchFilingsForClients(clients, years, { offline = false } = {}) {
  const ids = new Set(clients.map((c) => Number(c.id)));
  const names = [
    ...new Set(clients.map((c) => c.name).filter((n) => n && !n.startsWith('(override'))),
  ];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const seen = new Set();
  const out = [];
  for (const name of names) {
    // newest first; stop as soon as a page is entirely older than the earliest wanted year
    let page = 1;
    while (page <= 40) {
      const body = await ldaGet(
        `filings/?client_name=${encodeURIComponent(name)}&ordering=-dt_posted&page_size=100&page=${page}`,
        { offline },
      );
      if (!body) break;
      let allOlder = (body.results ?? []).length > 0;
      for (const f of body.results ?? []) {
        const fy = Number(f.filing_year);
        if (fy >= minYear) allOlder = false;
        if (fy < minYear || fy > maxYear) continue;
        const cid = Number(f.client?.id ?? f.client?.client_id);
        if (ids.has(cid) && !seen.has(f.filing_uuid)) {
          seen.add(f.filing_uuid);
          out.push(f);
        }
      }
      if (!body.next || allOlder) break;
      page++;
    }
  }
  // override-only ids (no name known) fall back to per-id queries
  for (const c of clients)
    if (String(c.name).startsWith('(override'))
      out.push(...(await fetchClientFilings(c.id, years, { offline })));
  return out;
}

/** All filings for a client in the given years (paginated). */
export async function fetchClientFilings(clientId, years, { offline = false } = {}) {
  const out = [];
  for (const y of years) {
    let page = 1;
    while (page <= 50) {
      const body = await ldaGet(
        `filings/?client_id=${clientId}&filing_year=${y}&page_size=100&page=${page}`,
        { offline },
      );
      if (!body) break;
      out.push(...(body.results ?? []));
      if (!body.next) break;
      page++;
    }
  }
  return out;
}

// ------------------------------------------------------------------ pure
/** Keep quarterly activity reports (Q1–Q4 + amendments), normalize, and mark superseded amendments. */
export function normalizeFilings(filings, symbol) {
  const rows = [];
  for (const f of filings) {
    const type = String(f.filing_type ?? '');
    if (!/^Q[1-4]/.test(type)) continue; // skip registrations (RR/RA), mid-year (MM/MA), etc.
    const income = f.income !== null && f.income !== undefined ? Number(f.income) : null;
    const expenses = f.expenses !== null && f.expenses !== undefined ? Number(f.expenses) : null;
    const amount = income ?? expenses ?? 0;
    rows.push({
      filing_uuid: f.filing_uuid,
      company_symbol: symbol,
      client_id: f.client?.id ?? f.client?.client_id ?? null,
      registrant_id: f.registrant?.id ?? null,
      registrant_name: f.registrant?.name ?? null,
      filing_year: Number(f.filing_year),
      filing_period: f.filing_period,
      filing_type: type,
      dt_posted: f.dt_posted ?? null,
      amount_usd: Number.isFinite(amount) ? amount : 0,
      amount_kind: income !== null ? 'income' : expenses !== null ? 'expenses' : null,
      issues_json: JSON.stringify(
        (f.lobbying_activities ?? []).map((a) => ({
          code: a.general_issue_code,
          display: a.general_issue_code_display,
          description: a.description ?? null,
          agencies: (a.government_entities ?? []).map((g) => g.name),
        })),
      ),
      document_url: f.filing_document_url ?? null,
      superseded: 0,
    });
  }
  // latest posting per (registrant, client, year, period) wins; earlier ones are superseded
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.registrant_id}|${r.client_id}|${r.filing_year}|${r.filing_period}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => String(b.dt_posted ?? '').localeCompare(String(a.dt_posted ?? '')));
    list.slice(1).forEach((r) => (r.superseded = 1));
  }
  return rows;
}

/**
 * Yearly totals with the standard de-duplication: per (year, period), if the company filed its own in-house
 * `expenses` report (which already includes payments to retained firms) use only that; else sum firms' `income`.
 */
export function summarizeLobbying(rows) {
  const byYear = {};
  const issues = {};
  const periods = new Map(); // `${year}|${period}` → { year, expenses, income }
  for (const r of rows) {
    if (r.superseded) continue;
    const k = `${r.filing_year}|${r.filing_period}`;
    const p = periods.get(k) ?? { year: r.filing_year, expenses: null, income: 0 };
    if (r.amount_kind === 'expenses') p.expenses = (p.expenses ?? 0) + (r.amount_usd ?? 0);
    else p.income += r.amount_usd ?? 0;
    periods.set(k, p);
    for (const i of JSON.parse(r.issues_json ?? '[]'))
      issues[i.display ?? i.code] = (issues[i.display ?? i.code] ?? 0) + 1;
  }
  for (const p of periods.values())
    byYear[p.year] = (byYear[p.year] ?? 0) + (p.expenses !== null ? p.expenses : p.income);
  const topIssues = Object.entries(issues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, filings]) => ({ name, filings }));
  return { byYear, topIssues };
}
