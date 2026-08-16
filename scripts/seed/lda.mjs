/**
 * Senate Lobbying Disclosure Act API (https://lda.gov/api/redoc/v1/). Anonymous access is throttled
 * (~15 req/min); a free registered key (Authorization: Token …) raises it. Every response is cached.
 */
import { CONFIG } from './config.mjs';
import { cachedGet, makeLimiter } from './http.mjs';
import { matchOrg, normOrg } from './orgmatch.mjs';

export const LDA_BASE = 'https://lda.gov/api/v1';
const key = () => process.env.LDA_API_KEY ?? '';
const limiter = makeLimiter(key() ? 100 : 12, 60_000);
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
  for (const alias of aliases) {
    const q = normOrg(alias);
    if (q.length < 3) continue;
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

export function summarizeLobbying(rows) {
  const byYear = {};
  const issues = {};
  for (const r of rows) {
    if (r.superseded) continue;
    byYear[r.filing_year] = (byYear[r.filing_year] ?? 0) + (r.amount_usd ?? 0);
    for (const i of JSON.parse(r.issues_json ?? '[]'))
      issues[i.display ?? i.code] = (issues[i.display ?? i.code] ?? 0) + 1;
  }
  const topIssues = Object.entries(issues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, filings]) => ({ name, filings }));
  return { byYear, topIssues };
}
