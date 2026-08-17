#!/usr/bin/env node
/**
 * Compass research seeder.
 *
 *   node scripts/seed/index.mjs funds      [--limit N] [--only SPY,VOO] [--offline]
 *   node scripts/seed/index.mjs rank
 *   node scripts/seed/index.mjs companies  [--overview N] [--statements N] [--only AAPL,MSFT] [--offline] [--refresh]
 *   node scripts/seed/index.mjs graph
 *   node scripts/seed/index.mjs all        (funds → rank → companies → graph)
 *   node scripts/seed/index.mjs political  [--cycles 2022,2024] [--years 2023,2024,2025] [--skip-employees] [--only AMZN,WMT] [--offline]
 *   node scripts/seed/index.mjs political:fec | political:lda | political:export   (individual stages)
 *   node scripts/seed/index.mjs status
 *
 * Every HTTP response is cached under db/cache so re-runs are free and throttled runs resume.
 */
import { CONFIG } from './config.mjs';
import { backfillHoldingSymbols, buildEffectiveHoldings, openDb } from './db.mjs';
import { rankFunds, seedFunds } from './seed-funds.mjs';
import { seedCompanies } from './seed-companies.mjs';
import { buildGraph, exportGraph } from './build-graph.mjs';
import { avCallsThisRun } from './alphavantage.mjs';
import {
  computePoliticalFacts,
  exportPoliticalFacts,
  exportPoliticalPack,
  seedFec,
  seedLobbying,
} from './seed-political.mjs';

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) ?? 'status';
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const num = (v, d) => (v === undefined || v === true ? d : Number(v));
const list = (v) =>
  typeof v === 'string'
    ? v
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : null;
const offline = !!opt('offline', false);

const db = openDb();
const t0 = Date.now();

async function main() {
  console.log(
    `Compass seeder · db=${CONFIG.dbPath} · cache=${CONFIG.cacheDir}${offline ? ' · OFFLINE (cache only)' : ''}`,
  );
  if (!CONFIG.alphaVantage.key && !offline)
    console.log(
      '  (no ALPHAVANTAGE_API_KEY — Alpha Vantage calls will be skipped; SEC N-PORT still works)',
    );
  if (cmd === 'funds' || cmd === 'all') {
    console.log('\n== funds');
    const s = await seedFunds(db, {
      limit: num(opt('limit'), Infinity),
      offline,
      only: list(opt('only')),
    });
    console.log('   ', JSON.stringify(s));
  }
  if (cmd === 'rank' || cmd === 'funds' || cmd === 'all') {
    console.log('\n== symbols');
    const { normOrg } = await import('./orgmatch.mjs');
    console.log('    back-fill', JSON.stringify(backfillHoldingSymbols(db, normOrg)));
    console.log('    look-through', JSON.stringify(buildEffectiveHoldings(db, normOrg)));
    console.log('\n== rank');
    console.log('   ', JSON.stringify(rankFunds(db)));
  }
  if (cmd === 'companies' || cmd === 'all') {
    console.log('\n== companies');
    const s = await seedCompanies(db, {
      overviewLimit: num(opt('overview'), 300),
      statementsLimit: num(opt('statements'), 50),
      offline,
      refresh: !!opt('refresh', false),
      only: list(opt('only')),
    });
    console.log('   ', JSON.stringify(s));
  }
  if (cmd === 'graph' || cmd === 'all') {
    console.log('\n== graph');
    const g = buildGraph(db);
    const p = exportGraph(g);
    console.log(
      `    funds=${g.counts.fundsInGraph} companies=${g.counts.companiesInGraph} edges=${g.counts.edges} → ${p}`,
    );
    const top = g.companies.slice(0, 15);
    if (top.length) {
      console.log('    Highest concentration (AUM-weighted):');
      for (const c of top)
        console.log(
          `      ${c.symbol.padEnd(6)} ${String(c.name).slice(0, 34).padEnd(34)} funds=${String(c.fundsHolding).padStart(3)} max=${(c.maxWeight * 100).toFixed(1).padStart(5)}% (${c.maxWeightFund}) $${(c.aumWeightedUsd / 1e9).toFixed(1)}B`,
        );
    }
  }
  const cycles = list(opt('cycles'))?.map(Number) ?? [2022, 2024];
  const years = list(opt('years'))?.map(Number) ?? [2023, 2024, 2025];
  if (cmd === 'political' || cmd === 'political:fec') {
    console.log('\n== political: FEC bulk (PAC + employees)');
    const s = await seedFec(db, {
      cycles,
      offline,
      skipEmployees: !!opt('skip-employees', false),
      only: list(opt('only')),
    });
    console.log('   ', JSON.stringify(s));
  }
  if (cmd === 'political' || cmd === 'political:lda') {
    console.log('\n== political: Senate LDA lobbying');
    const s = await seedLobbying(db, { years, offline, only: list(opt('only')) });
    console.log('   ', JSON.stringify({ ...s, errors: s.errors.slice(0, 5) }));
  }
  if (cmd === 'political' || cmd === 'political:export') {
    console.log('\n== political: lean + exports');
    const r = computePoliticalFacts(db, { cycles });
    const f = exportPoliticalFacts(r);
    const p = exportPoliticalPack(r);
    console.log(
      `    facts → ${f.path} ${JSON.stringify(f.counts)}\n    pack  → ${p.path} (${p.companies} records)`,
    );
    const top = Object.values(r.facts)
      .filter((x) => x.lean?.leanScore !== null)
      .sort((a, b) => b.lean.totalPartisanUsd - a.lean.totalPartisanUsd)
      .slice(0, 15);
    for (const c of top)
      console.log(
        `      ${c.symbol.padEnd(6)} lean ${String(c.lean.leanScore).padStart(2)} (${c.lean.confidence}) partisan $${(c.lean.totalPartisanUsd / 1e6).toFixed(2)}M · lobbying ${
          Object.entries(c.lobbying)
            .map(([y, v]) => `${y}:$${(v / 1e6).toFixed(1)}M`)
            .join(' ') || '—'
        }`,
      );
  }
  if (cmd === 'status') {
    const q = (sql) => db.prepare(sql).get();
    console.log(
      '    funds     ',
      q(
        'SELECT COUNT(*) n, SUM(net_assets IS NOT NULL) with_assets, SUM(popularity_rank <= ' +
          CONFIG.topN +
          ') in_top FROM fund',
      ),
    );
    console.log(
      '    holdings  ',
      q('SELECT COUNT(*) n, COUNT(DISTINCT holding_symbol) symbols FROM fund_holding'),
    );
    console.log('    companies ', q('SELECT COUNT(*) n FROM company'));
    console.log(
      '    periods   ',
      q('SELECT COUNT(*) n, COUNT(DISTINCT symbol) symbols FROM financial_period'),
    );
    console.log(
      '    last log  ',
      db
        .prepare('SELECT source, endpoint, key, status, at FROM fetch_log ORDER BY id DESC LIMIT 1')
        .get() ?? '(none)',
    );
    console.log('    throttles ', q("SELECT COUNT(*) n FROM fetch_log WHERE status='throttled'"));
    console.log(
      '    political ',
      q(
        'SELECT (SELECT COUNT(*) FROM political_committee) committees, (SELECT COUNT(DISTINCT company_symbol) FROM political_contribution) companies_with_contribs, (SELECT COUNT(*) FROM lobbying_filing) lobbying_filings',
      ),
    );
  }
  console.log(
    `\nAlpha Vantage calls this run: ${avCallsThisRun()} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
main()
  .catch((e) => {
    console.error('seed failed:', e);
    process.exit(1);
  })
  .finally(() => db.close());
