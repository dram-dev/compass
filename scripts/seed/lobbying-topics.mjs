/**
 * Axis-2 inputs from Senate LDA filings already in the DB (docs/political-seed.md, "Lobbying topics").
 *
 * Topic, never position: a flag records that a filing touched a subject (tariffs, antitrust, subsidies…),
 * not which way the company argued. Two kinds of flags per filing:
 *   code     — the filing's LDA general issue codes that matter for protection-seeking (TAR, TRD, …)
 *   keyword  — regex hits over the free-text "specific lobbying issues" (method 'keyword-v1'), with a
 *              ≤ 200-char evidence snippet from the public filing
 *
 * P1 (trade-protection lobbying share) is computed per company as a share of REPORTED filing dollars
 * (retained-firm income + in-house expenses) and then applied to the de-duplicated per-period total
 * (in-house-first rule, v_lobbying_period), so P1 dollars never exceed the lobbying total shown elsewhere.
 * Two attributions are reported: any-code (a filing counts fully if any of its codes is TAR/TRD) and
 * issue-weighted (filing $ × TAR/TRD codes ÷ distinct codes on the filing).
 */

export const PROTECTION_CODES = ['TAR', 'TRD'];
export const TOPIC_CODES = {
  TAR: 'Miscellaneous tariff bills',
  TRD: 'Trade (domestic & foreign)',
  TAX: 'Taxation / Internal Revenue Code',
  BUD: 'Budget / appropriations',
  GOV: 'Government issues',
  DEF: 'Defense',
  CPT: 'Copyright / patent / trademark',
  LBR: 'Labor issues / antitrust / workplace',
  SMB: 'Small business',
};

/** keyword-v1 — a screen, not a classifier. Regexes are deliberately literal so the audit trail is obvious. */
export const KEYWORD_TOPICS = [
  {
    topic: 'tariff',
    re: /\btariffs?\b|\bsection 232\b|\bsection 301\b|\banti-?dumping\b|\bcountervailing\b|\bimport (?:duties|quotas?|restrictions?)\b|\bquotas?\b/i,
  },
  {
    topic: 'tariff-exclusion',
    re: /\b(?:tariff|product|section 232|section 301)[^.;]{0,40}\bexclusions?\b|\bexclusions? (?:requests?|process)\b/i,
  },
  {
    topic: 'domestic-content',
    re: /\bbuy americ|\bbuild americ|\bdomestic (?:content|sourcing|preference|manufactur\w*|production)\b|\bmade in (?:the )?(?:u\.?s\.?a?|america)\b|\bberry amendment\b|\bjones act\b|\bamerican-made\b/i,
  },
  {
    topic: 'antitrust',
    re: /\bantitrust\b|\banti-trust\b|\bmonopol\w*|\bmergers?\b|\bcompetition (?:law|policy|act|enforcement)\b|\banti-?competitive\b/i,
  },
  {
    topic: 'licensing-certification',
    re: /\blicens(?:ing|ure)\b|\blicense requirements?\b|\bcertification requirements?\b|\baccreditation\b|\bpermitting reform\b|\bmarket entry\b/i,
  },
  {
    topic: 'subsidy',
    re: /\bsubsid\w*|\bloan guarantees?\b|\btax credits?\b|\bproduction credits?\b|\bgrant programs?\b|\bchips (?:and science )?act\b|\binflation reduction act\b|\badvanced manufacturing\b/i,
  },
  {
    topic: 'procurement',
    re: /\bprocurement\b|\bfederal contract\w*|\bgovernment contract\w*|\bacquisition (?:regulations?|reform|policy)\b|\bdfars\b|\bsole[- ]source\b|\bset[- ]asides?\b/i,
  },
  {
    topic: 'trade-agreement',
    re: /\bfree trade agreements?\b|\btrade agreements?\b|\busmca\b|\bwto\b|\bmarket access\b|\bexport controls?\b|\bde minimis\b|\bgeneralized system of preferences\b|\bgsp\b/i,
  },
];
export const KEYWORD_METHOD = 'keyword-v1';

const snippet = (text, index, len = 200) => {
  const s = String(text);
  const start = Math.max(0, index - Math.floor(len / 3));
  const out = s
    .slice(start, start + len)
    .replace(/\s+/g, ' ')
    .trim();
  return (start > 0 ? '…' : '') + out + (start + len < s.length ? '…' : '');
};

/** Parse issues_json defensively → [{code, description}]. */
export function parseIssues(issuesJson) {
  try {
    const arr = JSON.parse(issuesJson ?? '[]');
    return Array.isArray(arr)
      ? arr.map((a) => ({ code: String(a?.code ?? ''), description: a?.description ?? null }))
      : [];
  } catch {
    return [];
  }
}

/** Topic flags for one filing row ({ issues_json }). One row per topic (first evidence kept). */
export function topicsForFiling(row) {
  const issues = parseIssues(row.issues_json);
  const out = new Map();
  for (const a of issues) {
    if (TOPIC_CODES[a.code] && !out.has(a.code))
      out.set(a.code, { topic: a.code, kind: 'code', method: 'lda-issue-code', evidence: null });
  }
  for (const a of issues) {
    const text = a.description ?? '';
    if (!text) continue;
    for (const k of KEYWORD_TOPICS) {
      if (out.has(k.topic)) continue;
      const m = k.re.exec(text);
      if (m)
        out.set(k.topic, {
          topic: k.topic,
          kind: 'keyword',
          method: KEYWORD_METHOD,
          evidence: snippet(text, m.index),
        });
    }
  }
  return [...out.values()];
}

/** Rebuild lobbying_filing_topic for every non-superseded filing. */
export function refreshFilingTopics(db, { log = () => {} } = {}) {
  const rows = db
    .prepare('SELECT filing_uuid, issues_json FROM lobbying_filing WHERE superseded = 0')
    .all();
  const ins = db.prepare(
    'INSERT OR REPLACE INTO lobbying_filing_topic (filing_uuid, topic, kind, method, evidence) VALUES (?,?,?,?,?)',
  );
  db.exec('BEGIN');
  db.exec('DELETE FROM lobbying_filing_topic');
  let flags = 0;
  const byTopic = {};
  for (const r of rows) {
    for (const t of topicsForFiling(r)) {
      ins.run(r.filing_uuid, t.topic, t.kind, t.method, t.evidence);
      flags++;
      byTopic[t.topic] = (byTopic[t.topic] ?? 0) + 1;
    }
  }
  db.exec('COMMIT');
  log(`    topic flags: ${flags} over ${rows.length} filings · ${JSON.stringify(byTopic)}`);
  return { filings: rows.length, flags, byTopic };
}

/**
 * Pure aggregation over filing rows for ONE company:
 *   rows: [{ filing_uuid, filing_year, filing_period, amount_usd, amount_kind, issues_json, document_url, superseded }]
 * Returns the protectionActivity block (null when there are no non-superseded filings).
 */
export function summarizeProtection(rows) {
  const live = rows.filter((r) => !r.superseded);
  if (!live.length) return null;
  const periods = new Map(); // `${year}|${period}` → { year, reported, expenses, income, filings: [] }
  for (const r of live) {
    const k = `${r.filing_year}|${r.filing_period}`;
    const p = periods.get(k) ?? {
      year: r.filing_year,
      reported: 0,
      expenses: null,
      income: 0,
      filings: [],
    };
    const amt = Number(r.amount_usd) || 0;
    p.reported += amt;
    if (r.amount_kind === 'expenses') p.expenses = (p.expenses ?? 0) + amt;
    else p.income += amt;
    const flags = topicsForFiling(r);
    const codes = [
      ...new Set(
        parseIssues(r.issues_json)
          .map((a) => a.code)
          .filter(Boolean),
      ),
    ];
    const protCodes = codes.filter((c) => PROTECTION_CODES.includes(c));
    p.filings.push({
      uuid: r.filing_uuid,
      amount: amt,
      url: r.document_url ?? null,
      any: protCodes.length > 0 ? 1 : 0,
      weighted: codes.length ? protCodes.length / codes.length : 0,
      codes: protCodes,
      topics: new Set(flags.map((f) => f.topic)),
    });
    periods.set(k, p);
  }
  const years = new Set();
  let total = 0;
  let filings = 0;
  let anyUsd = 0;
  let weightedUsd = 0;
  let protFilings = 0;
  const codeCounts = {};
  const topics = {}; // topic → { filings, usdAny }
  const verify = [];
  for (const p of periods.values()) {
    years.add(p.year);
    const dedup = p.expenses !== null ? p.expenses : p.income; // in-house-first rule
    total += dedup;
    filings += p.filings.length;
    const n = p.filings.length;
    // share of reported dollars; when nothing was reported in $ (all "< $5,000" rows), fall back to filing counts
    const share = (pick) =>
      p.reported > 0
        ? p.filings.reduce((s, f) => s + f.amount * pick(f), 0) / p.reported
        : p.filings.reduce((s, f) => s + pick(f), 0) / n;
    anyUsd += share((f) => f.any) * dedup;
    weightedUsd += share((f) => f.weighted) * dedup;
    const seenTopics = new Set();
    for (const f of p.filings) {
      if (f.any) {
        protFilings++;
        for (const c of f.codes) codeCounts[c] = (codeCounts[c] ?? 0) + 1;
        if (f.url && verify.length < 5 && !verify.includes(f.url)) verify.push(f.url);
      }
      for (const t of f.topics) {
        const o = (topics[t] ??= { filings: 0, usdAny: 0 });
        o.filings++;
        seenTopics.add(t);
      }
    }
    for (const t of seenTopics) topics[t].usdAny += share((f) => (f.topics.has(t) ? 1 : 0)) * dedup;
  }
  for (const f of [...periods.values()].flatMap((p) => p.filings))
    if (verify.length < 5 && f.url && f.topics.size && !verify.includes(f.url)) verify.push(f.url);
  const round = (n) => Math.round(n);
  const out = {
    years: [...years].sort(),
    lobbyTotalUsd: round(total),
    filings,
    tradeProtection: {
      anyUsd: round(anyUsd),
      weightedUsd: round(weightedUsd),
      anyShare: total > 0 ? +(anyUsd / total).toFixed(4) : null,
      weightedShare: total > 0 ? +(weightedUsd / total).toFixed(4) : null,
      filings: protFilings,
      codes: codeCounts,
    },
    topics: Object.fromEntries(
      Object.entries(topics)
        .sort((a, b) => b[1].usdAny - a[1].usdAny)
        .map(([t, o]) => [
          t,
          {
            filings: o.filings,
            usdAny: round(o.usdAny),
            share: total > 0 ? +(o.usdAny / total).toFixed(4) : null,
            kind: TOPIC_CODES[t] ? 'code' : 'keyword',
          },
        ]),
    ),
    verify,
    method:
      'P1 = lobbying $ on filings coded TAR/TRD (any-code and issue-weighted) as a share of reported filing $, applied to the per-period in-house-first total; topics = LDA issue codes + keyword-v1 over specific-issue text. Topic, not position (docs/political-seed.md).',
  };
  return out;
}

/** protectionActivity for every company with filings: Map symbol → block. */
export function computeProtectionActivity(db) {
  const rows = db
    .prepare(
      'SELECT company_symbol, filing_uuid, filing_year, filing_period, amount_usd, amount_kind, issues_json, document_url, superseded FROM lobbying_filing WHERE superseded = 0',
    )
    .all();
  const by = new Map();
  for (const r of rows)
    (by.get(r.company_symbol) ?? by.set(r.company_symbol, []).get(r.company_symbol)).push(r);
  const out = new Map();
  for (const [s, list] of by) {
    const b = summarizeProtection(list);
    if (b) out.set(s, b);
  }
  return out;
}
