import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { log, now } from './db.mjs';
import { buildAliasIndex, defaultAliases } from './orgmatch.mjs';
import {
  aggregateEmployees,
  aggregatePac,
  inferCommitteeParties,
  loadReference,
  makeRecipientPartyResolver,
  matchCommittees,
} from './fec.mjs';
import {
  fetchFilingsForClients,
  findClients,
  normalizeFilings,
  summarizeLobbying,
} from './lda.mjs';
import { composeSourceHint, computeLean } from './political.mjs';
import { SAMPLE_TICKERS } from './sample-tickers.mjs';

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};
export const ALIASES_PATH = path.join(CONFIG.root, 'data', 'employer-aliases.json');
export const OVERRIDES_PATH = path.join(CONFIG.root, 'data', 'political-overrides.json');
export const SAMPLE_PATH = path.join(CONFIG.root, 'src', 'data', 'companies.sample.json');
export const FACTS_EXPORT =
  process.env.COMPASS_POLITICAL_EXPORT ??
  path.join(CONFIG.root, 'src', 'data', 'generated', 'political-facts.json');
export const PACK_EXPORT =
  process.env.COMPASS_POLITICAL_PACK ??
  path.join(CONFIG.root, 'src', 'data', 'generated', 'political-pack.json');

/** Ticker universe: DB companies ∪ sample-brand tickers ∪ curated alias keys; plus name→alias index. */
export function politicalUniverse(db, { only = null } = {}) {
  const aliasesFile = readJson(ALIASES_PATH, { aliases: {} }).aliases ?? {};
  const sample = readJson(SAMPLE_PATH, []);
  const names = new Map(); // symbol → display name
  // canonical display name: DB company name → first curated alias → sample brand name → ticker
  for (const c of db.prepare('SELECT symbol, name FROM company').all()) names.set(c.symbol, c.name);
  const sameAs = {};
  for (const [t, v] of Object.entries(aliasesFile)) {
    if (v && !Array.isArray(v) && v.sameAs) sameAs[t] = v.sameAs;
    else if (!names.has(t)) names.set(t, v[0] ?? t);
  }
  for (const c of sample) if (c.ticker && !names.has(c.ticker)) names.set(c.ticker, c.name);
  for (const t of SAMPLE_TICKERS) if (!names.has(t)) names.set(t, t);
  // Top held companies from the fund graph (issuer names from the filings), when the fund tables exist.
  const heldNames = new Map(); // symbol → { name, aum }
  try {
    const rows = db
      .prepare(
        `SELECT v.symbol, v.name, v.aum_weighted_usd AS aum FROM v_company_concentration v
      WHERE v.symbol IS NOT NULL ORDER BY v.aum_weighted_usd DESC LIMIT ?`,
      )
      .all(CONFIG.politicalTopHeld ?? 500);
    for (const r of rows) {
      if (!/^[A-Z][A-Z0-9]{0,4}(-[A-Z])?$/.test(r.symbol)) continue; // US-listed forms only (BRK-B ok; ENR.DE excluded)
      const nm = String(r.name ?? '')
        .replace(/\s+—.*$/, '')
        .trim(); // drop security title suffix
      if (!names.has(r.symbol) && nm) names.set(r.symbol, nm);
      heldNames.set(r.symbol, { name: nm, aum: r.aum });
    }
  } catch {
    /* fund tables not seeded yet */
  }
  const symbols = [...names.keys()]
    .filter((s) => !only || only.includes(s))
    .filter((s) => !sameAs[s])
    .sort();
  const entries = symbols.map((symbol) => {
    const set = new Set(defaultAliases(names.get(symbol)));
    for (const a of Array.isArray(aliasesFile[symbol]) ? aliasesFile[symbol] : []) set.add(a);
    for (const c of sample)
      if (c.ticker === symbol) defaultAliases(c.name).forEach((a) => set.add(a));
    if (heldNames.has(symbol))
      defaultAliases(heldNames.get(symbol).name).forEach((a) => set.add(a));
    return { symbol, aliases: [...set] };
  });
  return { symbols, entries, names, sameAs, aliasIndex: buildAliasIndex(entries) };
}

// ------------------------------------------------------------------ FEC
export async function seedFec(
  db,
  {
    cycles = [2022, 2024],
    offline = false,
    skipEmployees = false,
    only = null,
    log: out = console.log,
  } = {},
) {
  const uni = politicalUniverse(db, { only });
  const overrides = readJson(OVERRIDES_PATH, {});
  const excludeEmployers = new Set(overrides.excludeEmployerStrings ?? []);
  const summary = { cycles: [], committees: 0, pacRows: 0, employeeMatched: 0, skipped: [] };
  const computedAt = now();
  const insCommittee = db.prepare(
    `INSERT OR REPLACE INTO political_committee (company_symbol, committee_id, committee_name, connected_org, org_type, designation, match_method, cycle_seen) VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insContribution = db.prepare(
    `INSERT OR REPLACE INTO political_contribution (company_symbol, cycle, channel, party, amount_usd, txn_count, source, computed_at) VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insEmployer = db.prepare(
    `INSERT OR REPLACE INTO political_employer_match (company_symbol, employer_raw, cycle, amount_usd, txn_count) VALUES (?,?,?,?,?)`,
  );

  for (const cycle of cycles) {
    out(`\n  FEC cycle ${cycle}`);
    const ref = await loadReference(cycle, { offline, log: out });
    if (!ref) {
      out(`  ! reference files for ${cycle} not available offline — skipping cycle`);
      summary.skipped.push(cycle);
      continue;
    }
    const inferred = await inferCommitteeParties(cycle, ref, { offline, log: out });
    out(
      `    recipient parties inferred for ${inferred.size} leadership/super/caucus PACs from their own giving (≥80% one-sided)`,
    );
    const resolveParty = makeRecipientPartyResolver(
      ref.committees,
      ref.candidates,
      ref.links,
      inferred,
    );
    const matched = matchCommittees(ref.committees, uni.aliasIndex, overrides);
    const committeeToSymbol = new Map();
    db.exec('BEGIN');
    db.prepare('DELETE FROM political_committee WHERE cycle_seen = ?').run(cycle);
    for (const m of matched) {
      committeeToSymbol.set(m.committeeId, m.symbol);
      insCommittee.run(
        m.symbol,
        m.committeeId,
        m.name,
        m.connectedOrg ?? null,
        m.orgType ?? null,
        m.designation ?? null,
        m.method,
        cycle,
      );
    }
    db.exec('COMMIT');
    summary.committees += matched.length;
    out(
      `    committees matched: ${matched.length} (${matched.filter((m) => m.method === 'exact').length} exact, ${matched.filter((m) => m.method.includes('prefix')).length} prefix, ${matched.filter((m) => m.method === 'override').length} override)`,
    );

    const pac = await aggregatePac(cycle, committeeToSymbol, resolveParty, ref.candidates, {
      offline,
      log: out,
    });
    if (pac) {
      db.exec('BEGIN');
      db.prepare("DELETE FROM political_contribution WHERE cycle = ? AND channel = 'pac'").run(
        cycle,
      );
      for (const [k, t] of pac.totals) {
        const [symbol, party] = k.split('|');
        insContribution.run(
          symbol,
          cycle,
          'pac',
          party,
          Math.round(t.amount),
          t.count,
          `fec-bulk:pas2${String(cycle).slice(-2)}+oth${String(cycle).slice(-2)}`,
          computedAt,
        );
      }
      db.exec('COMMIT');
      summary.pacRows += pac.rows;
      out(`    PAC transactions counted: ${pac.rows}`);
    } else summary.skipped.push(`${cycle}:pac`);

    if (!skipEmployees) {
      const emp = await aggregateEmployees(
        cycle,
        uni.aliasIndex,
        resolveParty,
        { offline, log: out },
        {
          excludeEmployers,
          ownCommittees: committeeToSymbol,
          onProgress: (n) => out(`    … ${(n / 1e6).toFixed(0)}M individual rows scanned`),
        },
      );
      if (emp) {
        db.exec('BEGIN');
        db.prepare(
          "DELETE FROM political_contribution WHERE cycle = ? AND channel = 'employee'",
        ).run(cycle);
        db.prepare('DELETE FROM political_employer_match WHERE cycle = ?').run(cycle);
        db.prepare(
          "DELETE FROM political_contribution WHERE cycle = ? AND channel = 'pac-inflow'",
        ).run(cycle);
        for (const [k, t] of emp.totals) {
          const [symbol, party] = k.split('|');
          if (party === 'PAC')
            insContribution.run(
              symbol,
              cycle,
              'pac-inflow',
              'U',
              Math.round(t.amount),
              t.count,
              `fec-bulk:indiv${String(cycle).slice(-2)}`,
              computedAt,
            );
          else
            insContribution.run(
              symbol,
              cycle,
              'employee',
              party,
              Math.round(t.amount),
              t.count,
              `fec-bulk:indiv${String(cycle).slice(-2)}`,
              computedAt,
            );
        }
        // keep the top 40 raw employer strings per company for audit
        const perSymbol = new Map();
        for (const [k, t] of emp.employers) {
          const [symbol, raw] = k.split('|');
          (perSymbol.get(symbol) ?? perSymbol.set(symbol, []).get(symbol)).push({ raw, ...t });
        }
        for (const [symbol, list] of perSymbol)
          list
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 40)
            .forEach((e) => insEmployer.run(symbol, e.raw, cycle, Math.round(e.amount), e.count));
        db.exec('COMMIT');
        summary.employeeMatched += emp.matched;
        out(`    individual rows scanned: ${emp.lines} · matched to companies: ${emp.matched}`);
      } else summary.skipped.push(`${cycle}:indiv`);
    }
    log(db, 'fec', 'bulk', String(cycle), 'ok', JSON.stringify({ committees: matched.length }));
    summary.cycles.push(cycle);
  }
  return summary;
}

// ------------------------------------------------------------------ LDA
export async function seedLobbying(
  db,
  { years = [2023, 2024, 2025], offline = false, only = null, log: out = console.log } = {},
) {
  const uni = politicalUniverse(db, { only });
  const overrides = readJson(OVERRIDES_PATH, {});
  const insClient = db.prepare(
    'INSERT OR REPLACE INTO lobbying_client (company_symbol, client_id, client_name, match_method) VALUES (?,?,?,?)',
  );
  const insFiling =
    db.prepare(`INSERT OR REPLACE INTO lobbying_filing (filing_uuid, company_symbol, client_id, registrant_id, registrant_name, filing_year, filing_period, filing_type, dt_posted, amount_usd, amount_kind, issues_json, document_url, superseded)
    VALUES (@filing_uuid,@company_symbol,@client_id,@registrant_id,@registrant_name,@filing_year,@filing_period,@filing_type,@dt_posted,@amount_usd,@amount_kind,@issues_json,@document_url,@superseded)`);
  const summary = { companies: 0, clients: 0, filings: 0, errors: [] };
  for (const e of uni.entries) {
    try {
      const clients = await findClients(e.symbol, e.aliases, uni.aliasIndex, {
        offline,
        overrides,
      });
      if (!clients.length) continue;
      for (const c of clients) insClient.run(e.symbol, c.id, c.name, c.method);
      const all = await fetchFilingsForClients(clients, years, { offline });
      const rows = normalizeFilings(all, e.symbol);
      db.exec('BEGIN');
      for (const r of rows) insFiling.run(r);
      db.exec('COMMIT');
      summary.companies++;
      summary.clients += clients.length;
      summary.filings += rows.length;
      const s = summarizeLobbying(rows);
      out(
        `  LDA ${e.symbol.padEnd(6)} clients=${clients.length} filings=${rows.length} ${Object.entries(
          s.byYear,
        )
          .map(([y, v]) => `${y}:$${(v / 1e6).toFixed(1)}M`)
          .join(' ')}`,
      );
      log(
        db,
        'lda',
        'filings',
        e.symbol,
        'ok',
        `${clients.length} clients · ${rows.length} filings`,
      );
    } catch (err) {
      summary.errors.push(`${e.symbol}: ${err.message}`);
      log(db, 'lda', 'filings', e.symbol, 'error', String(err.message));
      out(`  LDA ${e.symbol} error: ${err.message}`);
    }
  }
  return summary;
}

// ------------------------------------------------------------------ lean + exports
export function computePoliticalFacts(db, { cycles = [2022, 2024] } = {}) {
  const computedAt = now();
  const uni = politicalUniverse(db);
  const contrib = db
    .prepare(
      `SELECT company_symbol, cycle, channel, party, amount_usd, txn_count FROM political_contribution WHERE cycle IN (${cycles.map(() => '?').join(',')})`,
    )
    .all(...cycles);
  const committees = db
    .prepare(
      'SELECT company_symbol, committee_id, committee_name, match_method FROM political_committee',
    )
    .all();
  const clients = db
    .prepare('SELECT company_symbol, client_id, client_name, match_method FROM lobbying_client')
    .all();
  const lobbying = db
    .prepare('SELECT company_symbol, filing_year, amount_usd, filings FROM v_lobbying_summary')
    .all();
  const issues = db
    .prepare('SELECT company_symbol, issues_json FROM lobbying_filing WHERE superseded = 0')
    .all();
  const employers = db
    .prepare(
      'SELECT company_symbol, employer_raw, SUM(amount_usd) AS amount FROM political_employer_match GROUP BY company_symbol, employer_raw ORDER BY amount DESC',
    )
    .all();

  const facts = {};
  const get = (s) =>
    (facts[s] ??= {
      symbol: s,
      name: uni.names.get(s) ?? s,
      pac: {},
      employee: {},
      pacInflow: {},
      lobbying: {},
      topIssues: [],
      committees: [],
      clients: [],
      employers: [],
      lean: null,
      sourceHint: '',
    });
  for (const r of contrib) {
    const f = get(r.company_symbol);
    if (r.channel === 'pac-inflow') {
      f.pacInflow[r.cycle] = (f.pacInflow[r.cycle] ?? 0) + r.amount_usd;
      continue;
    }
    const bucket = (f[r.channel][r.cycle] ??= { D: 0, R: 0, O: 0, U: 0, txns: 0 });
    bucket[r.party] += r.amount_usd;
    bucket.txns += r.txn_count;
  }
  for (const c of committees)
    get(c.company_symbol).committees.push({
      id: c.committee_id,
      name: c.committee_name,
      method: c.match_method,
    });
  for (const c of clients)
    get(c.company_symbol).clients.push({
      id: c.client_id,
      name: c.client_name,
      method: c.match_method,
    });
  for (const l of lobbying)
    get(l.company_symbol).lobbying[l.filing_year] = Math.round(l.amount_usd);
  const issueCounts = {};
  for (const i of issues) {
    const m = (issueCounts[i.company_symbol] ??= {});
    for (const x of JSON.parse(i.issues_json ?? '[]'))
      m[x.display ?? x.code] = (m[x.display ?? x.code] ?? 0) + 1;
  }
  for (const [s, m] of Object.entries(issueCounts))
    get(s).topIssues = Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, filings]) => ({ name, filings }));
  for (const e of employers) {
    const f = get(e.company_symbol);
    if (f.employers.length < 12)
      f.employers.push({ employer: e.employer_raw, amount: Math.round(e.amount) });
  }
  // second share classes (GOOG → GOOGL) inherit the canonical ticker's facts
  for (const [alias, canonical] of Object.entries(uni.sameAs)) {
    if (facts[canonical] && !facts[alias])
      facts[alias] = {
        ...JSON.parse(JSON.stringify(facts[canonical])),
        symbol: alias,
        name: `${facts[canonical].name} (${alias} share class)`,
        sameAs: canonical,
      };
  }
  for (const f of Object.values(facts)) {
    const sum = (ch) =>
      Object.values(f[ch]).reduce(
        (acc, b) => ({ D: acc.D + b.D, R: acc.R + b.R, O: acc.O + b.O, U: acc.U + b.U }),
        { D: 0, R: 0, O: 0, U: 0 },
      );
    const pac = sum('pac');
    const emp = sum('employee');
    const lean = computeLean({ pacD: pac.D, pacR: pac.R, empD: emp.D, empR: emp.R });
    f.totals = {
      pac,
      employee: emp,
      pacInflow: Object.values(f.pacInflow).reduce((a, b) => a + b, 0),
    };
    f.lean = {
      ...lean,
      cycles,
      method: 'r=(R−D)/(R+D) over PAC+employee, bins ±0.2/±0.6, min $5k; docs/political-seed.md',
    };
    f.sourceHint = composeSourceHint({
      cycles,
      pac,
      emp,
      lobbyingByYear: f.lobbying,
      committees: f.committees.map((c) => c.id),
      computedAt,
      lean,
    });
    f.links = {
      fec: f.committees.slice(0, 5).map((c) => `https://www.fec.gov/data/committee/${c.id}/`),
      lda: f.clients.slice(0, 5).map((c) => `https://lda.gov/api/v1/clients/${c.id}/`),
      opensecrets: `https://www.opensecrets.org/orgs/all-profiles?q=${encodeURIComponent(f.name)}`,
    };
  }
  return { computedAt, cycles, facts };
}

export function exportPoliticalFacts(result, outPath = FACTS_EXPORT) {
  const companies = Object.values(result.facts).sort(
    (a, b) => (b.lean?.totalPartisanUsd ?? 0) - (a.lean?.totalPartisanUsd ?? 0),
  );
  const doc = {
    schema: 'compass-political-facts',
    version: 1,
    generatedAt: result.computedAt,
    cycles: result.cycles,
    method:
      'FEC bulk (PAC via CONNECTED_ORG_NM + pas2/oth; employees via EMPLOYER exact-normalized match on indiv) and Senate LDA quarterly filings (latest amendment per registrant/client/period). Lean r=(R−D)/(R+D) binned ±0.2/±0.6; null below $5k partisan. Facts are public filings; the lean is a Compass derivation — verify at fec.gov / lda.gov / OpenSecrets.',
    counts: {
      companies: companies.length,
      withLean: companies.filter((c) => c.lean?.leanScore !== null).length,
      withLobbying: companies.filter((c) => Object.keys(c.lobbying).length).length,
    },
    companies,
  };
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc) + '\n');
  return { path: outPath, counts: doc.counts };
}

/** Compass data pack (docs/data-pack-schema.md): sample brands keep their id/name/parent so the record overrides cleanly. */
export function exportPoliticalPack(result, outPath = PACK_EXPORT) {
  const sample = readJson(SAMPLE_PATH, []);
  const byTicker = new Map();
  for (const c of sample)
    if (c.ticker) (byTicker.get(c.ticker) ?? byTicker.set(c.ticker, []).get(c.ticker)).push(c);
  const companies = [];
  for (const f of Object.values(result.facts)) {
    const hasAny = f.lean?.leanScore !== null || Object.keys(f.lobbying).length > 0;
    if (!hasAny) continue;
    const political = {
      leanScore: f.lean.leanScore,
      confidence: f.lean.confidence,
      sourceHint: f.sourceHint,
    };
    const targets = byTicker.get(f.symbol) ?? [];
    if (targets.length) {
      for (const s of targets) {
        const viaParent = s.name !== f.name ? `Via listed parent ${f.name} (${f.symbol}). ` : '';
        companies.push({
          id: s.id,
          name: s.name,
          ...(s.parentCompanyId ? { parentCompanyId: s.parentCompanyId } : {}),
          sector: s.sector,
          bucketDefault: s.bucketDefault,
          ticker: f.symbol,
          political: { ...political, sourceHint: (viaParent + political.sourceHint).slice(0, 500) },
          ratings: {},
        });
      }
    } else {
      companies.push({
        id: `co-${f.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: f.name,
        sector: 'Public company',
        bucketDefault: 'major',
        ticker: f.symbol,
        political,
        ratings: {},
      });
    }
  }
  const doc = {
    schema: 'compass-data-pack',
    version: 1,
    source: `FEC bulk ${result.cycles.join('/')} + Senate LDA via Compass seeder, ${result.computedAt.slice(0, 10)}`,
    sourceUrl: 'https://www.fec.gov/data/browse-data/?tab=bulk-data',
    notes:
      'Political-support leans derived from public FEC PAC + employee contributions and Senate LDA lobbying totals (method in docs/political-seed.md). No values ratings are asserted. Verify before acting.',
    companies,
  };
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc) + '\n');
  return { path: outPath, companies: companies.length };
}
