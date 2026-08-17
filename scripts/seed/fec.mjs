/**
 * FEC bulk data (https://www.fec.gov/data/browse-data/?tab=bulk-data). Per two-year cycle:
 *   cm    committee master (incl. CONNECTED_ORG_NM → company ↔ corporate PAC)
 *   cn    candidate master (party)
 *   ccl   candidate ↔ committee linkage
 *   pas2  contributions from committees to candidates (PAC → candidate)
 *   oth   committee-to-committee transactions (PAC → party committees / other PACs)
 *   indiv individual contributions (EMPLOYER field → "employees of company X")
 * Files are pipe-delimited, no header. Zips are streamed with yauzl + readline; nothing is loaded whole.
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import path from 'node:path';
import yauzl from 'yauzl';
import { CONFIG } from './config.mjs';
import { matchOrg } from './orgmatch.mjs';

export const FEC_BASE = 'https://www.fec.gov/files/bulk-downloads';
const yy = (cycle) => String(cycle).slice(-2);

/** Bulk file → path in cache; downloads once (with .part + rename), resumable across runs. */
export async function downloadBulk(cycle, name, { offline = false, log = console.log } = {}) {
  const dir = path.join(CONFIG.cacheDir, 'fec', String(cycle));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}${yy(cycle)}.zip`);
  if (existsSync(file) && statSync(file).size > 0) return { path: file, cached: true };
  if (offline) return { path: null, cached: false };
  const url = `${FEC_BASE}/${cycle}/${name}${yy(cycle)}.zip`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`FEC download failed ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  log(`  ↓ ${name}${yy(cycle)}.zip ${total ? `${(total / 1e6).toFixed(0)} MB` : ''}`);
  const part = `${file}.part`;
  let seen = 0;
  let nextMark = 250e6;
  const progress = new (await import('node:stream')).Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen >= nextMark) {
        log(`    … ${(seen / 1e6).toFixed(0)} MB`);
        nextMark += 250e6;
      }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), progress, createWriteStream(part));
  renameSync(part, file);
  return { path: file, cached: false, url };
}

/** Stream every line of the first .txt entry in a zip. onLine(fields[]) may return false to stop. */
export function streamZipLines(zipPath, onLine, { entryFilter = (n) => n.endsWith('.txt') } = {}) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let lines = 0;
      zip.readEntry();
      zip.on('entry', (entry) => {
        if (!entryFilter(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (e2, stream) => {
          if (e2) return reject(e2);
          const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
          let stopped = false;
          rl.on('line', (line) => {
            if (stopped || !line) return;
            lines++;
            if (onLine(line.split('|'), lines) === false) {
              stopped = true;
              rl.close();
              stream.destroy();
            }
          });
          rl.on('close', () => {
            zip.close();
            resolve(lines);
          });
          stream.on('error', reject);
        });
      });
      zip.on('error', reject);
      zip.on('end', () => resolve(lines));
    });
  });
}

// ------------------------------------------------------------------ pure parsers (bulk layouts)
export const parseCm = (f) => ({
  id: f[0],
  name: f[1],
  designation: f[8],
  type: f[9],
  party: f[10],
  orgType: f[12],
  connectedOrg: f[13],
  candId: f[14],
});
export const parseCn = (f) => ({ id: f[0], name: f[1], party: f[2] });
export const parseCcl = (f) => ({ candId: f[0], cmteId: f[3], cmteType: f[4], designation: f[5] });
export const parsePas2 = (f) => ({
  cmteId: f[0],
  txType: f[5],
  entityType: f[6],
  name: f[7],
  employer: f[11],
  amount: Number(f[14]) || 0,
  otherId: f[15],
  candId: f[16],
  memo: f[19],
  subId: f[21],
});
export const parseOth = (f) => ({
  cmteId: f[0],
  txType: f[5],
  entityType: f[6],
  name: f[7],
  amount: Number(f[14]) || 0,
  otherId: f[15],
  memo: f[18],
  subId: f[20],
});
export const parseIndiv = (f) => ({
  cmteId: f[0],
  txType: f[5],
  entityType: f[6],
  name: f[7],
  employer: f[11],
  occupation: f[12],
  amount: Number(f[14]) || 0,
  otherId: f[15],
  memo: f[18],
  subId: f[20],
});

/** FEC party codes → D / R / O (third party) / U (blank). */
const NO_PARTY = new Set(['', 'UNK', 'NNE', 'NON', 'NPA', 'UN', 'N', 'NONE']);
export function partyOf(code) {
  const c = String(code ?? '')
    .trim()
    .toUpperCase();
  if (NO_PARTY.has(c)) return 'U';
  if (c === 'DEM' || c === 'DFL' || c === 'D') return 'D';
  if (c === 'REP' || c === 'R') return 'R';
  return 'O'; // IND, GRE, LIB, CON, … — real third parties / independents
}

/**
 * Party of the recipient committee: its own affiliation → its linked candidate's → the party inferred
 * from its own giving/spending (leadership PACs, party-aligned super PACs, caucus PACs) → U.
 */
export function makeRecipientPartyResolver(committees, candidates, links, inferred = new Map()) {
  const cache = new Map();
  return (cmteId) => {
    if (cache.has(cmteId)) return cache.get(cmteId);
    let p = 'U';
    const c = committees.get(cmteId);
    if (c) {
      const own = partyOf(c.party);
      if (own !== 'U') p = own;
      else if (c.candId && candidates.has(c.candId)) p = partyOf(candidates.get(c.candId).party);
    }
    if (p === 'U') {
      const candId = links.get(cmteId);
      if (candId && candidates.has(candId)) p = partyOf(candidates.get(candId).party);
    }
    if (p === 'U' && inferred.has(cmteId)) p = inferred.get(cmteId);
    cache.set(cmteId, p);
    return p;
  };
}

export const INFER_MIN_USD = 10_000;
export const INFER_MIN_SHARE = 0.8;

/**
 * Infer the party of committees that carry no party code and no candidate link — leadership PACs,
 * party-aligned super PACs, caucus PACs — from their OWN behavior in pas2 for the cycle: direct
 * contributions (24K/24Z) to candidates count for the candidate's party; independent expenditures
 * supporting (24E) count for it, opposing (24A) count against it. Assigns a party only when the
 * committee moved ≥ INFER_MIN_USD and ≥ INFER_MIN_SHARE of it pointed one way. Returns Map id → 'D'|'R'.
 */
export function inferPartiesFromRows(rows, candidates) {
  const acc = new Map(); // cmteId → { D, R }
  for (const r of rows) {
    if (!r.candId || !candidates.has(r.candId)) continue;
    let party = partyOf(candidates.get(r.candId).party);
    if (party !== 'D' && party !== 'R') continue;
    if (r.txType === '24A') party = party === 'D' ? 'R' : 'D';
    else if (r.txType !== '24K' && r.txType !== '24Z' && r.txType !== '24E') continue;
    if (r.memo === 'X') continue;
    const a = acc.get(r.cmteId) ?? { D: 0, R: 0 };
    a[party] += Math.abs(r.amount);
    acc.set(r.cmteId, a);
  }
  const out = new Map();
  for (const [id, a] of acc) {
    const t = a.D + a.R;
    if (t < INFER_MIN_USD) continue;
    if (a.D / t >= INFER_MIN_SHARE) out.set(id, 'D');
    else if (a.R / t >= INFER_MIN_SHARE) out.set(id, 'R');
  }
  return out;
}

const TRANSFER_TX = new Set(['24K', '24Z', '24G']); // contributions + transfers to affiliated (JFC distributions)

/**
 * Two sources feed the inference for committees with no party code and no candidate link:
 *  - pas2: their contributions / independent expenditures to candidates (leadership PACs, super PACs);
 *  - oth:  their contributions / transfers to committees whose party is resolvable — joint fundraising
 *          committees ("Harris Victory Fund", "Trump National Committee JFC") distribute to candidate and
 *          party committees this way and otherwise look non-partisan.
 */
export async function inferCommitteeParties(cycle, ref, opts, { maxRounds = 4 } = {}) {
  const pas2 = await downloadBulk(cycle, 'pas2', opts);
  const oth = await downloadBulk(cycle, 'oth', opts);
  if (!pas2.path || !oth.path) return new Map();
  const unresolved = (id) => {
    const c = ref.committees.get(id);
    return !!c && partyOf(c.party) === 'U' && !c.candId && !ref.links.has(id);
  };
  const pas2Rows = [];
  await streamZipLines(pas2.path, (f) => {
    const r = parsePas2(f);
    if (unresolved(r.cmteId))
      pas2Rows.push({
        cmteId: r.cmteId,
        candId: r.candId,
        txType: r.txType,
        amount: r.amount,
        memo: r.memo,
      });
  });
  const othRows = [];
  await streamZipLines(oth.path, (f) => {
    const r = parseOth(f);
    if (TRANSFER_TX.has(r.txType) && r.memo !== 'X' && r.otherId && unresolved(r.cmteId))
      othRows.push({ cmteId: r.cmteId, otherId: r.otherId, amount: r.amount });
  });
  // Fixed point: a committee that transfers to an already-inferred committee (SMP → its affiliated
  // spending arm) is inferred in the next round.
  let inferred = new Map();
  for (let round = 0; round < maxRounds; round++) {
    const resolve = makeRecipientPartyResolver(ref.committees, ref.candidates, ref.links, inferred);
    const pseudo = new Map(ref.candidates);
    const rows = [...pas2Rows];
    for (const r of othRows) {
      const p = resolve(r.otherId);
      if (p !== 'D' && p !== 'R') continue;
      const key = `cmte:${r.otherId}`;
      if (!pseudo.has(key)) pseudo.set(key, { party: p === 'D' ? 'DEM' : 'REP' });
      rows.push({ cmteId: r.cmteId, candId: key, txType: '24K', amount: r.amount, memo: '' });
    }
    const next = inferPartiesFromRows(rows, pseudo);
    const grew = next.size > inferred.size;
    inferred = next;
    if (!grew) break;
  }
  return inferred;
}

/** Load the small reference files for a cycle. */
export async function loadReference(cycle, opts) {
  const committees = new Map();
  const candidates = new Map();
  const links = new Map();
  const cm = await downloadBulk(cycle, 'cm', opts);
  const cn = await downloadBulk(cycle, 'cn', opts);
  const ccl = await downloadBulk(cycle, 'ccl', opts);
  if (!cm.path || !cn.path || !ccl.path) return null;
  await streamZipLines(cm.path, (f) => {
    const c = parseCm(f);
    committees.set(c.id, c);
  });
  await streamZipLines(cn.path, (f) => {
    const c = parseCn(f);
    candidates.set(c.id, c);
  });
  await streamZipLines(ccl.path, (f) => {
    const l = parseCcl(f);
    // principal campaign / authorized / leadership committees → candidate
    if (!links.has(l.cmteId)) links.set(l.cmteId, l.candId);
  });
  return { committees, candidates, links };
}

/**
 * Company ↔ committee matching from CONNECTED_ORG_NM (and, weaker, from the committee name itself).
 * Returns [{ committeeId, name, connectedOrg, orgType, designation, symbol, method }].
 * Only corporate-ish committees: ORG_TP in {C, W} or connected-org matched; never party/candidate committees.
 */
export function matchCommittees(committees, aliasIndex, overrides = {}) {
  const out = [];
  const forced = new Map(); // committeeId → symbol
  const excluded = new Set();
  for (const [symbol, ids] of Object.entries(overrides.committees ?? {})) {
    for (const id of ids) id.startsWith('!') ? excluded.add(id.slice(1)) : forced.set(id, symbol);
  }
  for (const c of committees.values()) {
    if (excluded.has(c.id)) continue;
    if (forced.has(c.id)) {
      out.push({
        committeeId: c.id,
        name: c.name,
        connectedOrg: c.connectedOrg,
        orgType: c.orgType,
        designation: c.designation,
        symbol: forced.get(c.id),
        method: 'override',
      });
      continue;
    }
    if (c.type === 'P' || c.type === 'H' || c.type === 'S' || partyOf(c.party) !== 'U') continue; // candidate / party committees
    if (c.orgType === 'L' || c.orgType === 'M' || c.orgType === 'T' || c.orgType === 'V') continue; // labor, membership, trade, coop
    const corporate = c.orgType === 'C' || c.orgType === 'W';
    let m =
      c.connectedOrg && c.connectedOrg !== 'NONE' ? matchOrg(c.connectedOrg, aliasIndex) : null;
    if (m && m.method === 'exact-ambiguous') m = null;
    if (!m && c.name && corporate) {
      // Corporate PAC named after the sponsor: "MICROSOFT CORPORATION STAKEHOLDERS VOLUNTARY PAC". Single-word
      // aliases may prefix-match here only when followed by a legal-form / PAC word (see orgmatch SAFE_NEXT).
      const mm = matchOrg(c.name, aliasIndex, { singleWordPrefix: true });
      if (mm && mm.method !== 'exact-ambiguous') m = { ...mm, method: `name-${mm.method}` };
    }
    if (m)
      out.push({
        committeeId: c.id,
        name: c.name,
        connectedOrg: c.connectedOrg,
        orgType: c.orgType,
        designation: c.designation,
        symbol: m.symbol,
        method: m.method,
      });
  }
  return out;
}

const PAC_TX = new Set(['24K', '24Z']); // direct contributions (not 24A/24E independent expenditures)
const IND_TX = new Set(['15', '15E', '15J', '10', '11', '22Y']);

/**
 * PAC channel: stream pas2 + oth for a cycle, sum by (symbol, recipient party). De-duplicated by SUB_ID.
 * `committeeToSymbol`: Map committeeId → symbol.
 */
export async function aggregatePac(cycle, committeeToSymbol, resolveParty, candidates, opts) {
  const totals = new Map(); // `${symbol}|${party}` → { amount, count }
  const seen = new Set();
  const add = (symbol, party, amount) => {
    const k = `${symbol}|${party}`;
    const t = totals.get(k) ?? { amount: 0, count: 0 };
    t.amount += amount;
    t.count += 1;
    totals.set(k, t);
  };
  const pas2 = await downloadBulk(cycle, 'pas2', opts);
  const oth = await downloadBulk(cycle, 'oth', opts);
  if (!pas2.path || !oth.path) return null;
  let rows = 0;
  await streamZipLines(pas2.path, (f) => {
    const r = parsePas2(f);
    const symbol = committeeToSymbol.get(r.cmteId);
    if (!symbol || !PAC_TX.has(r.txType) || r.memo === 'X') return;
    seen.add(r.subId);
    const party =
      r.candId && candidates.has(r.candId)
        ? partyOf(candidates.get(r.candId).party)
        : resolveParty(r.otherId);
    add(symbol, party, r.amount);
    rows++;
  });
  await streamZipLines(oth.path, (f) => {
    const r = parseOth(f);
    const symbol = committeeToSymbol.get(r.cmteId);
    if (!symbol || !PAC_TX.has(r.txType) || r.memo === 'X' || seen.has(r.subId)) return;
    if (
      r.entityType &&
      r.entityType !== 'COM' &&
      r.entityType !== 'PAC' &&
      r.entityType !== 'PTY' &&
      r.entityType !== 'CCM'
    )
      return;
    add(symbol, resolveParty(r.otherId), r.amount);
    rows++;
  });
  return { totals, rows };
}

/**
 * Senior-executive sub-tier from the free-text OCCUPATION field (docs/political-seed.md, "Executive tier").
 * Deliberately narrow — the tier exists so a Goods-Unite-Us-comparable "PAC + executives" figure can be shown
 * next to "all employees"; false negatives are cheaper than counting a bank's thousands of VPs as executives.
 *   in:  C-suite (CEO/CFO/COO/CTO/…, "CHIEF … OFFICER", "CHIEF EXECUTIVE"), PRESIDENT (incl. divisional),
 *        CHAIRMAN/CHAIRWOMAN/CHAIRPERSON/CHAIR, FOUNDER/CO-FOUNDER, GENERAL/MANAGING PARTNER, MANAGING DIRECTOR,
 *        EXECUTIVE/SENIOR VICE PRESIDENT (EVP/SVP), BOARD MEMBER / BOARD OF DIRECTORS
 *   out: plain VICE PRESIDENT / VP, DIRECTOR, PRINCIPAL, OWNER (franchisees), ASSISTANT/DEPUTY/ASSOCIATE-to-…,
 *        RETIRED/FORMER, "CHIEF" trades (chief engineer, chief pilot, chief of staff)
 */
export function isExecutiveOccupation(occupation) {
  const s = String(occupation ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return false;
  if (/\b(RETIRED|FORMER|ASSISTANT|ASST|DEPUTY|ASSOCIATE|SECRETARY|OFFICE OF|TO THE)\b/.test(s))
    return false;
  if (/\b(EXECUTIVE|EXEC|SENIOR|SR) (VICE PRESIDENT|VP)\b/.test(s) || /\b(EVP|SVP)\b/.test(s))
    return true;
  const t = s.replace(/\b(VICE PRESIDENT|VP|AVP)\b/g, ' ');
  return /\b(CEO|CFO|COO|CTO|CIO|CMO|CRO|CLO|CPO|CHRO|CISO|CDO|CSO|CAO)\b|\bCHIEF EXECUTIVE\b|\bCHIEF [A-Z ]{0,30}OFFICER\b|\bPRESIDENT\b|\bCHAIR(MAN|WOMAN|PERSON)?\b|\bCO ?FOUNDER\b|\bFOUNDER\b|\b(GENERAL|MANAGING) PARTNER\b|\bMANAGING DIRECTOR\b|\bBOARD (MEMBER|OF DIRECTORS|DIRECTOR)\b/.test(
    t,
  );
}

/**
 * Employee channel: stream indiv for a cycle; EMPLOYER exact-normalized match → (symbol, recipient party).
 * Refunds (22Y) subtract. Memo rows skipped (earmark double counts). Keeps top raw employer strings per company.
 * `execTotals` is the senior-executive subset of `totals` (same rows, filtered by isExecutiveOccupation).
 */
export async function aggregateEmployees(
  cycle,
  aliasIndex,
  resolveParty,
  opts,
  { excludeEmployers = new Set(), onProgress, ownCommittees = new Map() } = {},
) {
  const totals = new Map();
  const execTotals = new Map();
  const employers = new Map(); // `${symbol}|${employerRaw}` → { amount, count }
  const indiv = await downloadBulk(cycle, 'indiv', opts);
  if (!indiv.path) return null;
  const matchCache = new Map();
  const execCache = new Map();
  let matched = 0;
  const lines = await streamZipLines(indiv.path, (f, n) => {
    if (onProgress && n % 2_000_000 === 0) onProgress(n);
    const r = parseIndiv(f);
    if (!IND_TX.has(r.txType) || r.memo === 'X' || (r.entityType && r.entityType !== 'IND')) return;
    if (!r.employer) return;
    let m = matchCache.get(r.employer);
    if (m === undefined) {
      const mm = matchOrg(r.employer, aliasIndex, { allowPrefix: false });
      m = mm && mm.method === 'exact' && !excludeEmployers.has(r.employer) ? mm.symbol : null;
      if (matchCache.size < 500_000) matchCache.set(r.employer, m);
    }
    if (!m) return;
    const amount = r.txType === '22Y' ? -Math.abs(r.amount) : r.amount;
    // employees funding their own company PAC: that money is already counted as the PAC's outgoing gifts
    const party = ownCommittees.get(r.cmteId) === m ? 'PAC' : resolveParty(r.cmteId);
    const k = `${m}|${party}`;
    const t = totals.get(k) ?? { amount: 0, count: 0 };
    t.amount += amount;
    t.count += 1;
    totals.set(k, t);
    let ex = execCache.get(r.occupation);
    if (ex === undefined) {
      ex = isExecutiveOccupation(r.occupation);
      if (execCache.size < 200_000) execCache.set(r.occupation, ex);
    }
    if (ex && party !== 'PAC') {
      const x = execTotals.get(k) ?? { amount: 0, count: 0 };
      x.amount += amount;
      x.count += 1;
      execTotals.set(k, x);
    }
    const ek = `${m}|${r.employer}`;
    const e = employers.get(ek) ?? { amount: 0, count: 0 };
    e.amount += amount;
    e.count += 1;
    employers.set(ek, e);
    matched++;
  });
  return { totals, execTotals, employers, lines, matched };
}
