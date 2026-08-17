/**
 * Lean derivation (pure, documented in docs/political-seed.md).
 *
 *   r = (R − D) / (R + D) over the selected cycles and channels (PAC + employees; O/U excluded)
 *   leanScore: r ≥ 0.6 → −2 · 0.2 ≤ r < 0.6 → −1 · |r| < 0.2 → 0 · −0.6 < r ≤ −0.2 → +1 · r ≤ −0.6 → +2
 *   (negative = conservative/Republican-leaning giving — ASSUMPTIONS #17)
 *   null when partisan dollars < MIN_PARTISAN_USD (Unknown, never guessed)
 *   confidence: high ≥ $250k partisan and both channels present · med ≥ $25k · low otherwise
 */
export const MIN_PARTISAN_USD = 5_000;
export const LEAN_BINS = [0.6, 0.2];
export const CONF_HIGH_USD = 250_000;
export const CONF_MED_USD = 25_000;

/** Bin r into the lean score (shared by the pooled lean and the per-stream leans). */
export function binLean(r) {
  if (r >= LEAN_BINS[0]) return -2;
  if (r >= LEAN_BINS[1]) return -1;
  if (r > -LEAN_BINS[1]) return 0;
  if (r > -LEAN_BINS[0]) return 1;
  return 2;
}

/**
 * One stream (PAC, all employees, or senior executives) on its own: same r, bins and $5k floor as the
 * pooled lean, no confidence tier. Streams are reported side by side because corporate PACs and
 * executives are different signals (docs/research-political-axes.md, findings 2 and 7).
 */
export function streamLean({ D = 0, R = 0 }) {
  const total = D + R;
  if (total < MIN_PARTISAN_USD) return { r: null, leanScore: null, partisanUsd: total };
  const r = (R - D) / total;
  return { r, leanScore: binLean(r), partisanUsd: total };
}

export function computeLean({ pacD = 0, pacR = 0, empD = 0, empR = 0 }) {
  const D = pacD + empD;
  const R = pacR + empR;
  const total = D + R;
  if (total < MIN_PARTISAN_USD)
    return { leanScore: null, r: null, totalPartisanUsd: total, confidence: 'low' };
  const r = (R - D) / total;
  const leanScore = binLean(r);
  const both = pacD + pacR > 0 && empD + empR > 0;
  const confidence =
    total >= CONF_HIGH_USD && both ? 'high' : total >= CONF_MED_USD ? 'med' : 'low';
  return { leanScore, r, totalPartisanUsd: total, confidence };
}

const money = (n) =>
  n >= 1e9
    ? `$${(n / 1e9).toFixed(1)}B`
    : n >= 1e6
      ? `$${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `$${(n / 1e3).toFixed(0)}k`
        : `$${Math.round(n)}`;
const split = (d, r) =>
  d + r > 0
    ? `D ${Math.round((d / (d + r)) * 100)}% / R ${Math.round((r / (d + r)) * 100)}%`
    : 'no partisan $';

/** Human-readable, source-citing hint stored on the company's PoliticalProfile. */
export function composeSourceHint({
  cycles,
  pac,
  emp,
  exec = null,
  lobbyingByYear,
  committees,
  computedAt,
  lean,
}) {
  const cyc = cycles.length ? `${Math.min(...cycles) - 1}–${Math.max(...cycles)}` : '';
  const parts = [];
  const pacT = pac.D + pac.R;
  const empT = emp.D + emp.R;
  if (pacT > 0) parts.push(`PAC ${money(pacT)} to candidates/parties (${split(pac.D, pac.R)})`);
  else if (pac.O + pac.U > 0)
    parts.push(`PAC ${money(pac.O + pac.U)} to non-party recipients only`);
  if (empT > 0)
    parts.push(`employees ${money(empT)} to candidates/parties (${split(emp.D, emp.R)})`);
  const exT = exec ? exec.D + exec.R : 0;
  if (exT > 0) parts.push(`of which senior executives ${money(exT)} (${split(exec.D, exec.R)})`);
  const lobY = Object.keys(lobbyingByYear).map(Number).sort();
  const lobT = Object.values(lobbyingByYear).reduce((s, v) => s + v, 0);
  if (lobY.length && lobT > 0)
    parts.push(`lobbying ${money(lobT)} (${lobY[0]}–${lobY[lobY.length - 1]}, Senate LDA)`);
  const src = parts.length
    ? `FEC ${cyc}: ${parts.join('; ')}.`
    : `No FEC PAC/employee contributions or LDA lobbying matched for ${cyc}.`;
  const leanTxt =
    lean.leanScore === null
      ? 'Lean not assigned (below $5k partisan).'
      : `Lean ${lean.leanScore > 0 ? '+' : ''}${lean.leanScore} (r=${lean.r.toFixed(2)}, ${lean.confidence} confidence).`;
  const links = committees
    .slice(0, 2)
    .map((c) => `fec.gov/data/committee/${c}/`)
    .join(' ');
  return `${src} ${leanTxt} Computed ${computedAt.slice(0, 10)} by Compass seeder (method: docs/political-seed.md).${links ? ` Verify: ${links}` : ''} OpenSecrets org search for cross-check.`.slice(
    0,
    480,
  );
}
