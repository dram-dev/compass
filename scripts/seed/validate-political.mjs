#!/usr/bin/env node
/**
 * Validation harness for the political pipeline (docs/PLAN-political-axes.md, Phase A4 / Phase B).
 *
 *   node scripts/seed/validate-political.mjs benchmark [--cycles 2020,2022,2024] [--write] [--strict]
 *
 * benchmark — distribution of each stream's Republican share of two-party dollars across the covered
 * companies, against the published corporate-PAC benchmark (Bertrand, Bombardini, Fisman, Trebbi & Yegen,
 * RES 2025: 2,456 PAC-holding public firms, 21,782 firm-cycles, 1980–2018 — mean 47.4% R, IQR 21.1–72.2%,
 * p10/p90 0%/100%). If our PAC distribution does not look like that, the matcher is wrong, not the
 * companies. `--write` refreshes docs/political-benchmark.md; `--strict` exits 1 on gross divergence.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { openDb } from './db.mjs';
import { MIN_PARTISAN_USD } from './political.mjs';
import { DEFAULT_CYCLES } from './seed-political.mjs';

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
    } else {
      console.error(`unknown command ${cmd}`);
      process.exit(2);
    }
  } finally {
    db.close();
  }
}
