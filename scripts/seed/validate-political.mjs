#!/usr/bin/env node
/**
 * Validation harness for the political pipeline (docs/PLAN-political-axes.md, Phase A4 / Phase B).
 *
 *   node scripts/seed/validate-political.mjs benchmark [--cycles 2020,2022,2024] [--write] [--strict]
 *   node scripts/seed/validate-political.mjs sample            → data/validation/political-sample.json + comparators.csv (Phase B1/B2 template)
 *   node scripts/seed/validate-political.mjs review-template   → data/validation/match-review.csv (Phase B3 template)
 *   node scripts/seed/validate-political.mjs validate [--strict] → ρ / κ from the filled CSVs → docs/political-validation.md (Phase B4)
 *   node scripts/seed/validate-political.mjs position-sample   → data/validation/position-sample.jsonl (Phase D2)
 *   node scripts/seed/validate-political.mjs position-kappa    → κ across data/validation/ratings-*.jsonl (Phase D3)
 *
 * benchmark — distribution of each stream's Republican share of two-party dollars across the covered
 * companies, against the published corporate-PAC benchmark (Bertrand, Bombardini, Fisman, Trebbi & Yegen,
 * RES 2025: 2,456 PAC-holding public firms, 21,782 firm-cycles, 1980–2018 — mean 47.4% R, IQR 21.1–72.2%,
 * p10/p90 0%/100%). If our PAC distribution does not look like that, the matcher is wrong, not the
 * companies. `--write` refreshes docs/political-benchmark.md; `--strict` exits 1 on gross divergence.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { openDb } from './db.mjs';
import { MIN_PARTISAN_USD } from './political.mjs';
import { DEFAULT_CYCLES, FACTS_EXPORT } from './seed-political.mjs';
import { topicsForFiling, parseIssues } from './lobbying-topics.mjs';
import {
  cohenKappa,
  parseCsv,
  pickPositionItems,
  spearman,
  stratifiedSample,
  toCsv,
} from './validation-lib.mjs';
import { SAMPLE_TICKERS } from './sample-tickers.mjs';

export const VALIDATION_DIR = path.join(CONFIG.root, 'data', 'validation');
const vpath = (n) => path.join(VALIDATION_DIR, n);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export const BBFTY = {
  mean: 47.4,
  p25: 21.1,
  p75: 72.2,
  p10: 0,
  p90: 100,
  source: 'BBFTY RES 2025 (NBER w30876), Table 1',
};
/**
 * Gross-divergence bounds (fail): generous on purpose — the benchmark spans 1980–2018, all PAC-holding public
 * firms, House winners only. Our universe is the largest / most-held firms, whose PACs are the most bipartisan,
 * so a NARROWER IQR than the benchmark is expected and only warned about; a mean far off centre or a
 * near-zero IQR would mean the matcher or the party resolver is broken.
 */
export const BOUNDS = { meanLo: 35, meanHi: 60, minIqrWidth: 8, warnIqrWidth: 25 };

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
export function describe(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    mean: +mean.toFixed(1),
    median: +quantile(v, 0.5).toFixed(1),
    p10: +quantile(v, 0.1).toFixed(1),
    p25: +quantile(v, 0.25).toFixed(1),
    p75: +quantile(v, 0.75).toFixed(1),
    p90: +quantile(v, 0.9).toFixed(1),
  };
}

/** Republican share of two-party $ per company (and per company-cycle) for one channel. */
export function republicanShares(rows, channel, { minUsd = MIN_PARTISAN_USD } = {}) {
  const pooled = new Map(); // symbol → {D,R}
  const perCycle = new Map(); // `${symbol}|${cycle}` → {D,R}
  for (const r of rows) {
    if (r.channel !== channel || (r.party !== 'D' && r.party !== 'R')) continue;
    for (const [map, k] of [
      [pooled, r.company_symbol],
      [perCycle, `${r.company_symbol}|${r.cycle}`],
    ]) {
      const t = map.get(k) ?? { D: 0, R: 0 };
      t[r.party] += r.amount_usd;
      map.set(k, t);
    }
  }
  const pct = (m) =>
    [...m.values()].filter((t) => t.D + t.R >= minUsd).map((t) => (100 * t.R) / (t.D + t.R));
  return { pooled: pct(pooled), perCycle: pct(perCycle) };
}

export function judgePac(stats) {
  const notes = [];
  if (stats.n < 30) notes.push(`only ${stats.n} PAC-holding companies — too few to judge`);
  if (stats.mean < BOUNDS.meanLo || stats.mean > BOUNDS.meanHi)
    notes.push(
      `mean %R ${stats.mean} outside ${BOUNDS.meanLo}–${BOUNDS.meanHi} (benchmark ${BBFTY.mean})`,
    );
  const warnings = [];
  const iqr = stats.p75 - stats.p25;
  if (iqr < BOUNDS.minIqrWidth)
    notes.push(
      `IQR ${stats.p25}–${stats.p75} is under ${BOUNDS.minIqrWidth} pts — near-uniform, check party resolution`,
    );
  else if (iqr < BOUNDS.warnIqrWidth)
    warnings.push(
      `IQR ${stats.p25}–${stats.p75} is narrower than the benchmark's ${BBFTY.p25}–${BBFTY.p75}: expected for a universe of the largest, most-held firms (the most access-seeking PACs) and for recipients that include party committees; confirm with the 40-firm hand check (Phase B)`,
    );
  return { ok: notes.length === 0, notes, warnings };
}

export function runBenchmark(db, { cycles = DEFAULT_CYCLES } = {}) {
  const rows = db
    .prepare(
      `SELECT company_symbol, cycle, channel, party, amount_usd FROM political_contribution WHERE cycle IN (${cycles.map(() => '?').join(',')})`,
    )
    .all(...cycles);
  const out = { cycles, streams: {}, judgement: null };
  for (const ch of ['pac', 'employee', 'executive']) {
    const s = republicanShares(rows, ch);
    out.streams[ch] = {
      pooled: describe(s.pooled),
      perCycle: describe(s.perCycle),
      byCycle: Object.fromEntries(
        cycles.map((c) => [
          c,
          describe(
            republicanShares(
              rows.filter((r) => r.cycle === c),
              ch,
            ).perCycle,
          ),
        ]),
      ),
    };
  }
  out.judgement = judgePac(out.streams.pac.perCycle);
  // executive share of employee two-party dollars (informational; BBFTY: executives are 23–31% of donors)
  const sum = (ch) =>
    rows
      .filter((r) => r.channel === ch && (r.party === 'D' || r.party === 'R'))
      .reduce((a, r) => a + r.amount_usd, 0);
  out.executiveShareOfEmployeeUsd =
    sum('employee') > 0 ? +(sum('executive') / sum('employee')).toFixed(3) : null;
  return out;
}

const fmt = (s) =>
  s.n
    ? `n=${s.n} · mean ${s.mean}% · median ${s.median}% · IQR ${s.p25}–${s.p75} · p10/p90 ${s.p10}/${s.p90}`
    : 'n=0';

export function renderMarkdown(b, generatedAt) {
  const L = [];
  L.push('# Political stream distributions vs the published benchmark');
  L.push('');
  L.push(
    `Generated ${generatedAt.slice(0, 10)} by \`npm run validate:political -- --write\` · cycles ${b.cycles.join('/')}.`,
  );
  L.push(
    'Republican share of two-party (D+R) dollars per company; companies under $5k partisan excluded.',
  );
  L.push('');
  L.push(`| Stream | Per company (pooled) | Per company-cycle |`);
  L.push('|---|---|---|');
  for (const ch of ['pac', 'employee', 'executive'])
    L.push(`| ${ch} | ${fmt(b.streams[ch].pooled)} | ${fmt(b.streams[ch].perCycle)} |`);
  L.push(
    `| **benchmark (corporate PAC)** | — | mean ${BBFTY.mean}% · IQR ${BBFTY.p25}–${BBFTY.p75} · p10/p90 ${BBFTY.p10}/${BBFTY.p90} (${BBFTY.source}) |`,
  );
  L.push('');
  L.push(
    'Per cycle (PAC stream): ' +
      Object.entries(b.streams.pac.byCycle)
        .map(([c, s]) => `${c}: ${fmt(s)}`)
        .join(' · '),
  );
  L.push('');
  L.push(
    `Executive subset = ${b.executiveShareOfEmployeeUsd === null ? 'n/a' : `${(b.executiveShareOfEmployeeUsd * 100).toFixed(0)}%`} of employee two-party dollars (senior-executive OCCUPATION keywords; BBFTY count executives as 23–31% of donors).`,
  );
  L.push('');
  L.push(
    b.judgement.ok
      ? '**Judgement: PAC distribution is consistent with the benchmark.**'
      : `**Judgement: check the matcher** — ${b.judgement.notes.join('; ')}.`,
  );
  for (const w of b.judgement.warnings ?? []) L.push('', `> Note: ${w}.`);
  L.push('');
  L.push(
    'Reading it: most corporate PACs give near 50/50 (access-seeking, tracks majority control), so a wide IQR centred a little under 50% R is the expected shape. Employees and executives are partisans and should be far more dispersed than PACs (docs/research-political-axes.md, findings 2, 3, 7).',
  );
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------------ Phase B: sample + templates
export const COMPARATOR_COLUMNS = [
  'symbol',
  'name',
  'stratum',
  'sector',
  'hasPac',
  'our_pac_pctR',
  'our_exec_pctR',
  'our_employee_pctR',
  'our_pooled_pctR',
  'our_lean',
  'opensecrets_dem_pct',
  'opensecrets_rep_pct',
  'opensecrets_cycle',
  'opensecrets_url',
  'guu_dem_pct',
  'guu_rep_pct',
  'guu_url',
  'notes',
];
export function buildSample(db) {
  const facts = readJson(FACTS_EXPORT).companies;
  const held = db
    .prepare(
      `SELECT v.symbol, c.sector FROM v_company_concentration v LEFT JOIN company c ON c.symbol = v.symbol
       WHERE v.symbol IS NOT NULL ORDER BY v.aum_weighted_usd DESC LIMIT 500`,
    )
    .all()
    .filter((r) => /^[A-Z][A-Z0-9]{0,4}(-[A-Z])?$/.test(r.symbol))
    .map((r, i) => ({ symbol: r.symbol, sector: r.sector, aumRank: i + 1 }));
  const rows = stratifiedSample(facts, held, SAMPLE_TICKERS);
  const os = (name) =>
    `https://www.opensecrets.org/orgs/all-profiles?q=${encodeURIComponent(name)}`;
  const csvRows = rows.map((r) => ({
    ...r,
    opensecrets_dem_pct: '',
    opensecrets_rep_pct: '',
    opensecrets_cycle: '',
    opensecrets_url: os(r.name),
    guu_dem_pct: '',
    guu_rep_pct: '',
    guu_url: 'https://www.goodsuniteus.com/',
    notes: '',
  }));
  return { rows, csvRows };
}
export function writeSample(db) {
  mkdirSync(VALIDATION_DIR, { recursive: true });
  const { rows, csvRows } = buildSample(db);
  writeFileSync(
    vpath('political-sample.json'),
    JSON.stringify(
      {
        schema: 'compass-political-validation-sample',
        generatedAt: new Date().toISOString(),
        note: 'Phase B validation sample (docs/PLAN-political-axes.md). Comparator numbers are hand-recorded and validation-only; never imported by src/.',
        companies: rows,
      },
      null,
      2,
    ) + '\n',
  );
  const csvPath = vpath('comparators.csv');
  if (existsSync(csvPath)) {
    // keep hand-entered values: merge by symbol
    const prev = new Map(parseCsv(readFileSync(csvPath, 'utf8')).map((r) => [r.symbol, r]));
    for (const r of csvRows) {
      const p = prev.get(r.symbol);
      if (!p) continue;
      for (const k of COMPARATOR_COLUMNS)
        if (k.startsWith('opensecrets_') || k.startsWith('guu_') || k === 'notes')
          if (p[k]) r[k] = p[k];
    }
  }
  writeFileSync(csvPath, toCsv(csvRows, COMPARATOR_COLUMNS));
  return { sample: vpath('political-sample.json'), comparators: csvPath, n: rows.length };
}

export const REVIEW_COLUMNS = [
  'symbol',
  'kind',
  'id',
  'name',
  'connected_org',
  'method',
  'fuzzy',
  'reviewer1',
  'reviewer2',
  'note',
];
export function buildReviewRows(db, symbols) {
  const q = symbols.map(() => '?').join(',');
  const committees = db
    .prepare(
      `SELECT DISTINCT company_symbol, committee_id, committee_name, connected_org, match_method FROM political_committee WHERE company_symbol IN (${q}) ORDER BY 1, 2`,
    )
    .all(...symbols);
  const clients = db
    .prepare(
      `SELECT company_symbol, client_id, client_name, match_method FROM lobbying_client WHERE company_symbol IN (${q}) ORDER BY 1, 2`,
    )
    .all(...symbols);
  const fuzzy = (m) => (m === 'exact' || m === 'override' ? 'no' : 'yes');
  // fuzzy rows first: reviewing them is the required hour; exact rows are the optional spot check
  const order = (r) => (r.fuzzy === 'yes' ? 0 : 1);
  return [
    ...committees.map((c) => ({
      symbol: c.company_symbol,
      kind: 'fec-committee',
      id: c.committee_id,
      name: c.committee_name,
      connected_org: c.connected_org ?? '',
      method: c.match_method,
      fuzzy: fuzzy(c.match_method),
      reviewer1: '',
      reviewer2: '',
      note: '',
    })),
    ...clients.map((c) => ({
      symbol: c.company_symbol,
      kind: 'lda-client',
      id: String(c.client_id),
      name: c.client_name,
      connected_org: '',
      method: c.match_method,
      fuzzy: fuzzy(c.match_method),
      reviewer1: '',
      reviewer2: '',
      note: '',
    })),
  ].sort(
    (a, b) =>
      order(a) - order(b) || a.symbol.localeCompare(b.symbol) || a.kind.localeCompare(b.kind),
  );
}
export function writeReviewTemplate(db) {
  const sample = readJson(vpath('political-sample.json')).companies.map((c) => c.symbol);
  const rows = buildReviewRows(db, sample);
  const p = vpath('match-review.csv');
  if (existsSync(p)) {
    const prev = new Map(parseCsv(readFileSync(p, 'utf8')).map((r) => [`${r.kind}|${r.id}`, r]));
    for (const r of rows) {
      const o = prev.get(`${r.kind}|${r.id}`);
      if (o) Object.assign(r, { reviewer1: o.reviewer1, reviewer2: o.reviewer2, note: o.note });
    }
  }
  writeFileSync(p, toCsv(rows, REVIEW_COLUMNS));
  return { path: p, rows: rows.length, fuzzy: rows.filter((r) => r.fuzzy === 'yes').length };
}

// ------------------------------------------------------------------ Phase B4: ρ + κ
export const PASS = { rhoPac: 0.7, kappaMatch: 0.8, kappaPosition: 0.7 };
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const pctFromDemRep = (d, r) => {
  const dd = num(d);
  const rr = num(r);
  return Number.isFinite(dd) && Number.isFinite(rr) && dd + rr > 0 ? (100 * rr) / (dd + rr) : NaN;
};
export function validateComparators(rows) {
  const ours = ['our_pac_pctR', 'our_exec_pctR', 'our_employee_pctR', 'our_pooled_pctR'];
  const comps = {
    opensecrets: rows.map((r) => pctFromDemRep(r.opensecrets_dem_pct, r.opensecrets_rep_pct)),
    guu: rows.map((r) => pctFromDemRep(r.guu_dem_pct, r.guu_rep_pct)),
  };
  const out = {};
  for (const [cname, cvals] of Object.entries(comps)) {
    out[cname] = {};
    for (const o of ours)
      out[cname][o] = spearman(
        rows.map((r) => num(r[o])),
        cvals,
      );
  }
  const recorded = {
    opensecrets: comps.opensecrets.filter(Number.isFinite).length,
    guu: comps.guu.filter(Number.isFinite).length,
    total: rows.length,
  };
  const pacRho = Math.max(
    out.opensecrets.our_pac_pctR.rho ?? -1,
    out.guu.our_pac_pctR.rho ?? -1,
    out.guu.our_exec_pctR.rho ?? -1,
  );
  return {
    rho: out,
    recorded,
    pass: pacRho >= PASS.rhoPac,
    pacRho: pacRho < -0.99 ? null : pacRho,
  };
}
export function validateMatchReview(rows) {
  const norm = (v) => {
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    return s === 'accept' || s === 'a' || s === 'y' || s === 'yes'
      ? 'accept'
      : s === 'reject' || s === 'r' || s === 'n' || s === 'no'
        ? 'reject'
        : '';
  };
  const both = rows.filter((r) => norm(r.reviewer1) && norm(r.reviewer2));
  const all = cohenKappa(
    both.map((r) => norm(r.reviewer1)),
    both.map((r) => norm(r.reviewer2)),
  );
  const fz = both.filter((r) => r.fuzzy === 'yes');
  const fuzzy = cohenKappa(
    fz.map((r) => norm(r.reviewer1)),
    fz.map((r) => norm(r.reviewer2)),
  );
  const rejected = both.filter(
    (r) => norm(r.reviewer1) === 'reject' && norm(r.reviewer2) === 'reject',
  );
  const disputed = both.filter((r) => norm(r.reviewer1) !== norm(r.reviewer2));
  return {
    reviewed: both.length,
    total: rows.length,
    all,
    fuzzy,
    rejected: rejected.map((r) => `${r.kind} ${r.symbol} ${r.id} ${r.name}`),
    disputed: disputed.map((r) => `${r.kind} ${r.symbol} ${r.id} ${r.name}`),
    pass: all.kappa !== null && all.kappa >= PASS.kappaMatch,
  };
}
export function renderValidationMarkdown({ comparators, review, position, generatedAt }) {
  const L = [
    '# Political validation — 40-firm hand check (Phase B) and position coding (Phase D)',
    '',
  ];
  L.push(
    `Generated ${generatedAt.slice(0, 10)} by \`node scripts/seed/validate-political.mjs validate\` / \`position-kappa\`.`,
    '',
  );
  L.push('## B4 · Spearman ρ vs hand-recorded comparators', '');
  if (!comparators) L.push('_comparators.csv not found — run `sample` first._', '');
  else {
    L.push(
      `Recorded: OpenSecrets ${comparators.recorded.opensecrets}/${comparators.recorded.total} · Goods Unite Us ${comparators.recorded.guu}/${comparators.recorded.total}. Comparators are validation-only (CC BY-NC-SA / proprietary) and never shipped.`,
      '',
    );
    L.push(
      '| Our stream (%R of D+R) | vs OpenSecrets (blended, latest cycle) | vs GUU (PAC + execs, 3 cycles) |',
      '|---|---|---|',
    );
    const f = (x) => (x.rho === null ? `— (n=${x.n})` : `ρ = ${x.rho} (n=${x.n})`);
    for (const o of ['our_pac_pctR', 'our_exec_pctR', 'our_employee_pctR', 'our_pooled_pctR'])
      L.push(
        `| ${o.replace('our_', '').replace('_pctR', '')} | ${f(comparators.rho.opensecrets[o])} | ${f(comparators.rho.guu[o])} |`,
      );
    L.push(
      '',
      `**Pass (ρ ≥ ${PASS.rhoPac} on the PAC stream): ${comparators.pacRho === null ? 'not yet computable' : comparators.pass ? 'yes' : 'no'}${comparators.pacRho === null ? '' : ` (best PAC/exec ρ = ${comparators.pacRho})`}**`,
      '',
    );
  }
  L.push("## B3 · Match audit — Cohen's κ between two reviewers", '');
  if (!review) L.push('_match-review.csv not found — run `review-template` first._', '');
  else {
    L.push(
      `Reviewed by both: ${review.reviewed}/${review.total} rows. κ (all rows) = ${review.all.kappa ?? '—'} (agreement ${review.all.agreement ?? '—'}, n=${review.all.n}); κ (fuzzy rows only) = ${review.fuzzy.kappa ?? '—'} (n=${review.fuzzy.n}).`,
      '',
    );
    if (review.rejected.length)
      L.push(
        'Rejected by both (fix in data/political-overrides.json):',
        ...review.rejected.map((r) => `- ${r}`),
        '',
      );
    if (review.disputed.length)
      L.push('Disputed (adjudicate):', ...review.disputed.map((r) => `- ${r}`), '');
    L.push(
      `**Pass (κ ≥ ${PASS.kappaMatch}): ${review.all.kappa === null ? 'not yet computable' : review.pass ? 'yes' : 'no'}**`,
      '',
    );
  }
  L.push('## D3 · Position coding — κ between raters', '');
  if (!position)
    L.push(
      '_no ratings files yet (data/validation/ratings-*.jsonl) — run `position-sample`, rate, then `position-kappa`._',
      '',
    );
  else {
    L.push(
      `Items: ${position.items} · raters: ${position.raters.join(', ')} · rated by all: ${position.common}.`,
      '',
    );
    for (const p of position.pairs)
      L.push(
        `- ${p.a} × ${p.b}: κ = ${p.kappa ?? '—'} (agreement ${p.agreement ?? '—'}, n=${p.n})`,
      );
    L.push('');
    if (position.pairs[0]?.confusion) {
      const cats = Object.keys(position.pairs[0].confusion);
      L.push(
        `Confusion (${position.pairs[0].a} rows × ${position.pairs[0].b} cols):`,
        '',
        `| | ${cats.join(' | ')} |`,
        `|---|${cats.map(() => '---').join('|')}|`,
      );
      for (const c of cats)
        L.push(`| ${c} | ${cats.map((d) => position.pairs[0].confusion[c][d]).join(' | ')} |`);
      L.push('');
    }
    if (position.byCode) {
      L.push('κ by issue code (first pair):', '');
      for (const [code, k] of Object.entries(position.byCode))
        L.push(`- ${code}: κ = ${k.kappa ?? '—'} (n=${k.n})`);
      L.push('');
    }
    L.push(
      `**Decision rule (κ ≥ ${PASS.kappaPosition}): ${position.minKappa === null ? 'not yet computable' : position.minKappa >= PASS.kappaPosition ? 'PASS → Phase F (classifier, human-reviewed)' : 'FAIL → ship P1–P4 only; name the axis "protection-seeking activity"'}**`,
      '',
    );
  }
  return L.join('\n');
}
export function runValidate() {
  const cmpPath = vpath('comparators.csv');
  const revPath = vpath('match-review.csv');
  const comparators = existsSync(cmpPath)
    ? validateComparators(parseCsv(readFileSync(cmpPath, 'utf8')))
    : null;
  const review = existsSync(revPath)
    ? validateMatchReview(parseCsv(readFileSync(revPath, 'utf8')))
    : null;
  const position = existsSync(vpath('position-sample.jsonl')) ? positionKappa() : null;
  return { comparators, review, position };
}

// ------------------------------------------------------------------ Phase D: position sample + κ
export function buildPositionActivities(db, symbols) {
  const q = symbols.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT f.company_symbol, f.filing_uuid, f.filing_year, f.filing_period, f.registrant_name, f.amount_kind, f.issues_json, f.document_url
       FROM lobbying_filing f WHERE f.superseded = 0 AND f.company_symbol IN (${q})`,
    )
    .all(...symbols);
  const names = new Map(readJson(FACTS_EXPORT).companies.map((c) => [c.symbol, c.name]));
  const out = [];
  for (const r of rows) {
    const topics = topicsForFiling(r).map((t) => t.topic);
    let issues;
    try {
      issues = JSON.parse(r.issues_json ?? '[]');
    } catch {
      issues = [];
    }
    for (const a of issues) {
      if (!a?.description) continue;
      out.push({
        symbol: r.company_symbol,
        company: names.get(r.company_symbol) ?? r.company_symbol,
        filing_uuid: r.filing_uuid,
        year: r.filing_year,
        period: r.filing_period,
        registrant: r.registrant_name,
        kind: r.amount_kind === 'expenses' ? 'in-house' : 'retained firm',
        code: a.code,
        codeDisplay: a.display ?? a.code,
        text: a.description,
        topics,
        url: r.document_url,
      });
    }
  }
  return out;
}
export function writePositionSample(db) {
  const sample = readJson(vpath('political-sample.json')).companies.map((c) => c.symbol);
  const items = pickPositionItems(buildPositionActivities(db, sample));
  const p = vpath('position-sample.jsonl');
  writeFileSync(p, items.map((it) => JSON.stringify(it)).join('\n') + '\n');
  const byCode = {};
  for (const it of items) byCode[it.code] = (byCode[it.code] ?? 0) + 1;
  return {
    path: p,
    items: items.length,
    companies: new Set(items.map((i) => i.symbol)).size,
    byCode,
  };
}
const LABELS = new Set(['protection', 'market-opening', 'neutral']);
export function readRatings(dir = VALIDATION_DIR) {
  const files = existsSync(dir)
    ? readdirSyncSafe(dir).filter((f) => /^ratings-.*\.jsonl$/.test(f))
    : [];
  const raters = {};
  for (const f of files) {
    const rater = f.replace(/^ratings-|\.jsonl$/g, '');
    const map = new Map();
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.id && LABELS.has(r.label)) map.set(r.id, r.label);
      } catch {
        /* skip malformed line */
      }
    }
    raters[rater] = map;
  }
  return raters;
}
function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
export function positionKappa(dir = VALIDATION_DIR) {
  const items = existsSync(path.join(dir, 'position-sample.jsonl'))
    ? readFileSync(path.join(dir, 'position-sample.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  const raters = readRatings(dir);
  const names = Object.keys(raters).sort();
  const common = names.length ? items.filter((it) => names.every((n) => raters[n].has(it.id))) : [];
  const pairs = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const k = cohenKappa(
        common.map((it) => raters[a].get(it.id)),
        common.map((it) => raters[b].get(it.id)),
      );
      pairs.push({ a, b, ...k });
    }
  let byCode = null;
  if (pairs.length) {
    byCode = {};
    const [a, b] = [pairs[0].a, pairs[0].b];
    for (const code of [...new Set(common.map((it) => it.code))].sort()) {
      const sub = common.filter((it) => it.code === code);
      const k = cohenKappa(
        sub.map((it) => raters[a].get(it.id)),
        sub.map((it) => raters[b].get(it.id)),
      );
      byCode[code] = { kappa: k.kappa, n: k.n };
    }
  }
  const ks = pairs.map((p) => p.kappa).filter((k) => k !== null);
  return {
    items: items.length,
    raters: names,
    common: common.length,
    pairs,
    byCode,
    minKappa: ks.length ? Math.min(...ks) : null,
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('--')) ?? 'benchmark';
  const opt = (n) => {
    const i = args.indexOf(`--${n}`);
    return i < 0 ? undefined : (args[i + 1] ?? true);
  };
  const cycles =
    typeof opt('cycles') === 'string' ? opt('cycles').split(',').map(Number) : DEFAULT_CYCLES;
  const db = openDb();
  try {
    if (cmd === 'benchmark') {
      const b = runBenchmark(db, { cycles });
      const md = renderMarkdown(b, new Date().toISOString());
      console.log(md);
      if (opt('write')) {
        const p = path.join(CONFIG.root, 'docs', 'political-benchmark.md');
        writeFileSync(p, md);
        console.log(`→ ${p}`);
      }
      if (opt('strict') && !b.judgement.ok) process.exit(1);
    } else if (cmd === 'sample') {
      const r = writeSample(db);
      console.log(
        `sample: ${r.n} companies → ${r.sample}\ncomparators template → ${r.comparators}`,
      );
      const t = writeReviewTemplate(db);
      console.log(`match-review template → ${t.path} (${t.rows} rows, ${t.fuzzy} fuzzy)`);
    } else if (cmd === 'review-template') {
      const t = writeReviewTemplate(db);
      console.log(`match-review template → ${t.path} (${t.rows} rows, ${t.fuzzy} fuzzy)`);
    } else if (cmd === 'position-sample') {
      const r = writePositionSample(db);
      console.log(
        `position sample: ${r.items} items over ${r.companies} companies → ${r.path}\n  by code ${JSON.stringify(r.byCode)}`,
      );
    } else if (cmd === 'validate' || cmd === 'position-kappa') {
      const r = runValidate();
      const md = renderValidationMarkdown({ ...r, generatedAt: new Date().toISOString() });
      console.log(md);
      const p = path.join(CONFIG.root, 'docs', 'political-validation.md');
      writeFileSync(p, md);
      console.log(`→ ${p}`);
      if (opt('strict')) {
        const ok = (r.comparators?.pass ?? false) && (r.review?.pass ?? false);
        if (!ok) process.exit(1);
      }
    } else {
      console.error(`unknown command ${cmd}`);
      process.exit(2);
    }
  } finally {
    db.close();
  }
}
