#!/usr/bin/env node
/**
 * Audit helper (run after `political:fec` for a cycle): streams the cycle's indiv file once and lists the
 * highest-dollar EMPLOYER strings that share a first word with a company alias but did NOT match exactly —
 * candidates for data/employer-aliases.json (add only real name variants of the same employer).
 *
 *   node scripts/seed/audit-employers.mjs 2024 [--top 80] [--min 20000]
 */
import { openDb } from './db.mjs';
import { politicalUniverse } from './seed-political.mjs';
import { downloadBulk, parseIndiv, streamZipLines } from './fec.mjs';
import { matchOrg, normOrg } from './orgmatch.mjs';

const args = process.argv.slice(2);
const cycle = Number(args.find((a) => /^\d{4}$/.test(a)) ?? 2024);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i < 0 ? d : Number(args[i + 1]);
};
const top = opt('top', 80);
const min = opt('min', 20000);

const db = openDb();
const uni = politicalUniverse(db);
const firstWords = new Map(); // first word → Set(symbols)
for (const e of uni.entries)
  for (const a of e.aliases) {
    const w = normOrg(a).split(' ')[0];
    if (w && w.length >= 4)
      (firstWords.get(w) ?? firstWords.set(w, new Set()).get(w)).add(e.symbol);
  }
const { path } = await downloadBulk(cycle, 'indiv', { offline: true });
if (!path) {
  console.error('indiv file not cached for', cycle);
  process.exit(1);
}
const near = new Map(); // employerRaw → { amount, syms }
const cache = new Map();
await streamZipLines(path, (f, n) => {
  if (n % 5_000_000 === 0) console.error(`… ${n / 1e6}M rows`);
  const r = parseIndiv(f);
  if (!r.employer || r.entityType !== 'IND' || r.memo === 'X') return;
  let res = cache.get(r.employer);
  if (res === undefined) {
    const nrm = normOrg(r.employer);
    const w = nrm.split(' ')[0];
    const syms = firstWords.get(w);
    const exact = matchOrg(r.employer, uni.aliasIndex, { allowPrefix: false });
    res = syms && !exact ? [...syms].join('/') : null;
    if (cache.size < 1_000_000) cache.set(r.employer, res);
  }
  if (!res) return;
  const e = near.get(r.employer) ?? { amount: 0, syms: res };
  e.amount += r.amount;
  near.set(r.employer, e);
});
const rows = [...near.entries()]
  .filter(([, v]) => v.amount >= min)
  .sort((a, b) => b[1].amount - a[1].amount)
  .slice(0, top);
console.log(
  `Unmatched employer strings sharing a first word with an alias (cycle ${cycle}, ≥ $${min}):`,
);
for (const [emp, v] of rows)
  console.log(`  $${String(Math.round(v.amount)).padStart(9)}  ${emp}  → ${v.syms}`);
db.close();
