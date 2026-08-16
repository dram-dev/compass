/**
 * Organization-name normalization + matching (pure). Used for FEC connected-org / employer strings and
 * LDA client names. Conservative by design: exact normalized match, or prefix match only for aliases of
 * ≥ 5 chars, and every match is written to the DB with its method so it can be audited/overridden.
 */
// Only legal-form suffixes are stripped. Words like GROUP / HOLDINGS / INTERNATIONAL / AMERICA are part of
// the name ("Bank of America", "American International Group") and must NOT be stripped.
const SUFFIXES = new Set([
  'INC',
  'INCORPORATED',
  'CORP',
  'CORPORATION',
  'CO',
  'COMPANY',
  'LLC',
  'LLP',
  'LP',
  'LTD',
  'LIMITED',
  'PLC',
  'SA',
  'NV',
  'AG',
  'SE',
]);

export function normOrg(s) {
  if (!s) return '';
  let t = String(s)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = t.split(' ').filter(Boolean);
  // strip trailing corporate suffixes and dangling connectors (repeatedly: "MERCK & CO INC" → MERCK), and a leading THE
  while (
    words.length > 1 &&
    (SUFFIXES.has(words[words.length - 1]) ||
      words[words.length - 1] === 'AND' ||
      words[words.length - 1] === 'OF')
  )
    words.pop();
  if (words.length > 1 && words[0] === 'THE') words.shift();
  t = words.join(' ');
  return t;
}

/** Build the alias index: normalized alias → [{ symbol, alias, kind }] */
export function buildAliasIndex(entries) {
  const idx = new Map();
  for (const { symbol, aliases } of entries) {
    for (const a of aliases) {
      const n = normOrg(a);
      if (!n) continue;
      const list = idx.get(n) ?? [];
      if (!list.some((x) => x.symbol === symbol)) list.push({ symbol, alias: a });
      idx.set(n, list);
    }
  }
  return idx;
}

/** Words that, right after a matched prefix, signal a *different* organization (bottlers, dealers, unions…). */
export const DENY_NEXT = new Set([
  'BOTTLING',
  'BOTTLERS',
  'CONSOLIDATED',
  'DISTRIBUTING',
  'DISTRIBUTORS',
  'DISTRIBUTION',
  'FRANCHISEE',
  'FRANCHISEES',
  'DEALERS',
  'DEALER',
  'ASSOCIATION',
  'ASSOCIATIONS',
  'ASSN',
  'CREDIT',
  'UNION',
  'FOUNDATION',
  'ALUMNI',
  'RETIREES',
  'RETIRED',
  'FEDERATION',
  'COUNCIL',
  'SOCIETY',
  'INSTITUTE',
]);
/** Words after a single-word alias that keep the match inside the same legal entity / its PAC. */
export const SAFE_NEXT = new Set([
  'INC',
  'INCORPORATED',
  'CORP',
  'CORPORATION',
  'CO',
  'COMPANY',
  'COMPANIES',
  'LLC',
  'LTD',
  'PLC',
  'LP',
  'EMPLOYEE',
  'EMPLOYEES',
  'PAC',
  'POLITICAL',
  'FEDERAL',
  'VOLUNTARY',
  'CITIZENS',
  'GOOD',
  'CIVIC',
  'COMMITTEE',
  'SEPARATE',
  'STAKEHOLDERS',
  'NETPAC',
  'ASSOCIATES',
]);

/**
 * Match a raw org string. Returns { symbol, method } or null.
 *  exact:  normalized string equals an alias.
 *  prefix: string starts with "<alias> ". Multi-word aliases ("BANK OF AMERICA") may prefix-match unless the next
 *          word is in DENY_NEXT ("COCA COLA BOTTLING …" ≠ Coca-Cola Co). Single-word aliases prefix-match only when
 *          `singleWordPrefix` is on AND the next word is in SAFE_NEXT ("MICROSOFT CORPORATION …" yes,
 *          "META FINANCIAL …" / "TARGET ENTERPRISES" no). Longest alias wins; ambiguity → 'exact-ambiguous'.
 */
export function matchOrg(raw, idx, { allowPrefix = true, singleWordPrefix = false } = {}) {
  const n = normOrg(raw);
  if (!n) return null;
  const exact = idx.get(n);
  if (exact?.length === 1)
    return { symbol: exact[0].symbol, method: 'exact', alias: exact[0].alias };
  if (exact && exact.length > 1)
    return {
      symbol: exact[0].symbol,
      method: 'exact-ambiguous',
      alias: exact[0].alias,
      candidates: exact.map((e) => e.symbol),
    };
  if (!allowPrefix) return null;
  let best = null;
  for (const [alias, list] of idx) {
    if (!n.startsWith(alias + ' ')) continue;
    const next = n.slice(alias.length + 1).split(' ')[0];
    if (alias.includes(' ')) {
      if (DENY_NEXT.has(next)) continue;
    } else {
      if (!singleWordPrefix || !SAFE_NEXT.has(next)) continue;
    }
    if (!best || alias.length > best.alias.length) best = { alias, list };
  }
  if (best && best.list.length === 1)
    return { symbol: best.list[0].symbol, method: 'prefix', alias: best.list[0].alias };
  return null;
}

/** Aliases for a company from its DB name + curated file: name, name minus punctuation, ticker is NOT an alias. */
export function defaultAliases(name) {
  const out = new Set();
  if (!name) return [];
  out.add(name);
  const n = normOrg(name);
  if (n) out.add(n);
  // "Amazon.com Inc" → also "AMAZON COM" and "AMAZON"
  const dotcom = n.replace(/\bCOM\b/g, '').trim();
  if (dotcom && dotcom !== n) out.add(dotcom);
  return [...out];
}
