/**
 * Statement CSV → monthly spend by category and destination bucket.
 *
 * Everything here is pure and runs in the browser: a statement is read with FileReader, parsed,
 * matched and aggregated locally, and nothing is ever uploaded (§10 local-first). The importer's
 * job is to remove typing, not to make judgements it cannot support:
 *   - dollars and categories are derived automatically (high confidence);
 *   - well-known chains are recognised from `data/merchantBrands.ts` and carry that brand's default
 *     bucket, which the review step can change;
 *   - anything unrecognised stays **Unknown** and is offered to the user to classify — the importer
 *     never guesses whether an unknown merchant is local, regional or major, and never infers a
 *     political lean from a merchant name.
 */
import type { BucketId, Company, SpendCategory } from '@/engine/types';
import { BUCKET_IDS } from '@/engine/types';
import {
  BRAND_RULES,
  CATEGORY_KEYWORDS,
  DESCRIPTOR_NOISE,
  EXCLUDE_RULES,
  FALLBACK_CATEGORY,
} from '@/data/merchantBrands';
import { parseDelimited, type DelimitedTable } from './csv';

// ------------------------------------------------------------------ column detection
export interface ColumnMap {
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  category: number | null;
}

const HEADER_PATTERNS = {
  date: /^(transaction\s*date|trans\.?\s*date|post(ed|ing)?\s*date|date|datum)$/i,
  description: /^(description|merchant|name|payee|details?|memo|narrative|transaction)$/i,
  amount: /^(amount|amt|value|betrag|transaction\s*amount)$/i,
  debit: /^(debit|withdrawal|charges?|money\s*out|paid\s*out)$/i,
  credit: /^(credit|deposit|payments?|money\s*in|paid\s*in)$/i,
  category: /^(category|type|classification)$/i,
};

/** Map header names to roles; falls back to sniffing the data when headers are unhelpful. */
export function detectColumns(table: DelimitedTable): ColumnMap {
  const map: ColumnMap = {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    category: null,
  };
  table.header.forEach((h, i) => {
    const name = h.trim();
    for (const key of ['date', 'description', 'amount', 'debit', 'credit', 'category'] as const) {
      if (map[key] === null && HEADER_PATTERNS[key].test(name)) map[key] = i;
    }
  });
  // "Transaction Date" and "Post Date" both match date — prefer the earliest labelled transaction date.
  const txnDate = table.header.findIndex((h) => /transaction\s*date|trans\.?\s*date/i.test(h));
  if (txnDate >= 0) map.date = txnDate;
  const sample = table.rows.slice(0, 40);
  const col = (i: number) => sample.map((r) => r[i] ?? '');
  if (map.date === null)
    map.date = table.header.findIndex(
      (_, i) =>
        col(i).filter((v) => parseDate(v) !== null).length >= Math.max(2, sample.length * 0.6),
    );
  if (map.date === -1) map.date = null;
  if (map.amount === null && map.debit === null) {
    // the numeric column with the most distinct non-integer values is the amount
    let best = -1;
    let bestScore = 0;
    table.header.forEach((_, i) => {
      const vals = col(i)
        .map(parseAmount)
        .filter((v): v is number => v !== null);
      if (vals.length < Math.max(2, sample.length * 0.6)) return;
      const score =
        new Set(vals.map((v) => v.toFixed(2))).size +
        vals.filter((v) => !Number.isInteger(v)).length;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) map.amount = best;
  }
  if (map.description === null) {
    // the column with the longest average text that is not the date/amount
    let best = -1;
    let bestLen = 0;
    table.header.forEach((_, i) => {
      if (i === map.date || i === map.amount || i === map.debit || i === map.credit) return;
      const vals = col(i);
      const len =
        vals.reduce((a, v) => a + v.replace(/[\d.,$-]/g, '').length, 0) / Math.max(1, vals.length);
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    });
    if (best >= 0 && bestLen >= 3) map.description = best;
  }
  return map;
}

// ------------------------------------------------------------------ value parsing
/** Statement amounts: `$1,234.56`, `(12.34)` for negative, `1.234,56` (EU), trailing `-`. */
export function parseAmount(raw: string): number | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    sign = -1;
    s = s.replace(/-\s*$/, '');
  }
  s = s.replace(/[^\d,.\-+]/g, '');
  if (!s || !/\d/.test(s)) return null;
  if (s.startsWith('-')) {
    sign *= -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // European: dots group, comma is the decimal separator
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

/** ISO, US (M/D/Y) and D.M.Y dates → `YYYY-MM-DD`. Ambiguous D/M vs M/D resolves per-file later. */
export function parseDate(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    let y = +m[3]!;
    if (y < 100) y += y < 70 ? 2000 : 1900;
    // a > 12 ⇒ a is the day (D/M/Y); otherwise assume M/D/Y (US card exports)
    return a > 12 ? iso(y, b, a) : iso(y, a, b);
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/.exec(s);
  if (m) {
    const mi = MONTHS.findIndex((x) => m![2]!.toLowerCase().startsWith(x));
    let y = +m[3]!;
    if (y < 100) y += 2000;
    if (mi >= 0) return iso(y, mi + 1, +m[1]!);
  }
  return null;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;

// ------------------------------------------------------------------ descriptor normalization
/** Strip processor prefixes, store/phone numbers and trailing geography from a card descriptor. */
export function normalizeDescriptor(raw: string): string {
  let s = String(raw ?? '')
    .toUpperCase()
    .replace(/&AMP;/g, '&')
    .replace(/[*#]+/g, (m) => (m.length ? ' ' + m + ' ' : m))
    .replace(/\s+/g, ' ')
    .trim();
  // re-apply processor prefixes after the spacing pass, then the noise list
  s = s.replace(/^(SQ|TST|SP|PY|IN|POS|PP|EB|WPY|CKE)\s*\*+\s*/i, '');
  for (const re of DESCRIPTOR_NOISE) s = s.replace(re, ' ');
  return (
    s
      .replace(/[^A-Z0-9&' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      // punctuation removal can expose a trailing TLD ("NETFLIX.COM" → "NETFLIX COM")
      .replace(/\s+(COM|NET|ORG|IO|CO UK|CA)$/i, '')
      .trim()
  );
}

/** Title-case a normalized descriptor for display ("BLUE BOTTLE COFFEE" → "Blue Bottle Coffee"). */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Of|The)\b/g, (m) => m.toLowerCase())
    .trim();
}

// ------------------------------------------------------------------ transactions
export interface RawTxn {
  date: string | null;
  description: string;
  amount: number; // positive = money spent
  rawCategory: string;
  /** null when the row is spending; otherwise why it was excluded. */
  excluded: string | null;
}

export interface ParsedFile {
  table: DelimitedTable;
  columns: ColumnMap;
  txns: RawTxn[];
  /** Rows that could not be read at all (no amount). */
  unreadable: number;
}

/**
 * Rows → transactions. Sign convention is detected per file: card exports write purchases as
 * positive (Chase) or negative (Amex, and most bank exports where credits are positive). We take the
 * dominant sign as "spending" and treat the other as credits/refunds.
 */
export function toTransactions(table: DelimitedTable, columns: ColumnMap): ParsedFile {
  const raw: { date: string | null; description: string; signed: number; rawCategory: string }[] =
    [];
  let unreadable = 0;
  for (const r of table.rows) {
    const desc = columns.description !== null ? (r[columns.description] ?? '') : '';
    const rawCategory = columns.category !== null ? (r[columns.category] ?? '') : '';
    let signed: number | null = null;
    if (columns.debit !== null || columns.credit !== null) {
      const d = columns.debit !== null ? parseAmount(r[columns.debit] ?? '') : null;
      const c = columns.credit !== null ? parseAmount(r[columns.credit] ?? '') : null;
      if (d !== null && d !== 0) signed = Math.abs(d);
      else if (c !== null && c !== 0) signed = -Math.abs(c);
    } else if (columns.amount !== null) {
      signed = parseAmount(r[columns.amount] ?? '');
    }
    if (signed === null || signed === 0) {
      if (desc.trim()) unreadable++;
      continue;
    }
    raw.push({
      date: columns.date !== null ? parseDate(r[columns.date] ?? '') : null,
      description: desc,
      signed,
      rawCategory,
    });
  }
  // Which sign dominates? That is spending.
  const pos = raw.filter((x) => x.signed > 0);
  const neg = raw.filter((x) => x.signed < 0);
  const spendIsPositive = pos.length >= neg.length;
  const txns: RawTxn[] = raw.map((x) => {
    const isSpend = spendIsPositive ? x.signed > 0 : x.signed < 0;
    const amount = Math.abs(x.signed);
    // A non-spend row keeps the more specific reason when one applies (an autopay row in the credit
    // column is a card payment, not just "a credit").
    const reason = excludeReason(x.description);
    const excluded = isSpend ? reason : (reason ?? 'credit');
    return {
      date: x.date,
      description: x.description,
      amount,
      rawCategory: x.rawCategory,
      excluded,
    };
  });
  return { table, columns, txns, unreadable };
}

/**
 * Non-discretionary / non-spend rows, judged from the **descriptor only**. The bank's own category
 * column is deliberately not consulted here: Chase files a Verizon phone bill under
 * "Bills & Utilities", which would wrongly drop a subscription the app wants to score. That column is
 * still used for *categorisation* (`categoryFor`), where a coarse hint is harmless.
 */
export function excludeReason(description: string): string | null {
  const hay = String(description ?? '').toUpperCase();
  for (const rule of EXCLUDE_RULES) if (rule.re.test(hay)) return rule.id;
  return null;
}

export const EXCLUDE_LABELS: Record<string, string> = {
  credit: 'Refunds & credits',
  ...Object.fromEntries(EXCLUDE_RULES.map((r) => [r.id, r.label])),
};

// ------------------------------------------------------------------ merchant matching
export interface MerchantMatch {
  /** Normalized descriptor used as the grouping key. */
  key: string;
  display: string;
  companyId: string | null;
  brand: string | null;
  bucket: BucketId;
  category: string;
  method: 'brand-rule' | 'company-name' | 'unmatched';
}

export interface CompanyIndexEntry {
  id: string;
  name: string;
  norm: string;
  bucket: BucketId;
}

/** Index existing companies (sample + imported + user) so a rated record is reused when it matches. */
export function buildCompanyIndex(companies: readonly Company[]): CompanyIndexEntry[] {
  return companies
    .filter((c) => !c.fictional)
    .map((c) => ({
      id: c.id,
      name: c.name,
      norm: normalizeDescriptor(c.name),
      bucket: c.bucketDefault,
    }))
    .filter((c) => c.norm.length >= 3)
    .sort((a, b) => b.norm.length - a.norm.length);
}

/** Category from a brand rule, the bank's category column, or descriptor keywords. */
export function categoryFor(norm: string, rawCategory = '', brandCategory?: string): string {
  if (brandCategory) return brandCategory;
  const hay = `${norm} ${rawCategory}`.toUpperCase();
  for (const { category, words } of CATEGORY_KEYWORDS)
    if (words.some((w) => hay.includes(w))) return category;
  return FALLBACK_CATEGORY;
}

/** Match one descriptor: brand rules first (they carry a bucket), then existing company names. */
export function matchMerchant(
  description: string,
  index: readonly CompanyIndexEntry[],
  rawCategory = '',
): MerchantMatch {
  const norm = normalizeDescriptor(description);
  const key =
    norm ||
    String(description ?? '')
      .trim()
      .toUpperCase();
  const display = titleCase(key) || '(blank)';
  for (const rule of BRAND_RULES) {
    if (
      rule.stems.some(
        (stem) =>
          norm === stem.trim() ||
          norm.startsWith(stem) ||
          norm.includes(` ${stem.trim()} `) ||
          norm.includes(stem.trim() + ' ') ||
          norm.endsWith(' ' + stem.trim()),
      )
    ) {
      return {
        // Group on the brand so "AMZN Mktp US*2H45R9OL3" and "AMZN Mktp US*1K92LM4Q1" are one merchant.
        key: `brand:${rule.brand}`,
        display: rule.brand,
        companyId: rule.sampleId ?? null,
        brand: rule.brand,
        bucket: rule.bucket,
        category: categoryFor(norm, rawCategory, rule.category),
        method: 'brand-rule',
      };
    }
  }
  const hit = index.find((c) => norm === c.norm || norm.startsWith(c.norm + ' '));
  if (hit)
    return {
      key: `company:${hit.id}`,
      display: hit.name,
      companyId: hit.id,
      brand: hit.name,
      bucket: hit.bucket,
      category: categoryFor(norm, rawCategory),
      method: 'company-name',
    };
  return {
    key,
    display,
    companyId: null,
    brand: null,
    bucket: 'unknown',
    category: categoryFor(norm, rawCategory),
    method: 'unmatched',
  };
}

// ------------------------------------------------------------------ aggregation
export interface MerchantGroup extends MerchantMatch {
  total: number; // dollars over the whole file set
  count: number;
  /** user overrides applied in the review step */
  bucketOverride?: BucketId;
  categoryOverride?: string;
  skip?: boolean;
}

export interface ImportSummary {
  months: number;
  from: string | null;
  to: string | null;
  rows: number;
  spendRows: number;
  excluded: Record<string, { count: number; total: number }>;
  groups: MerchantGroup[];
  unreadable: number;
}

/** Distinct-month span of the dated rows; falls back to 1 when a file has no usable dates. */
export function monthsCovered(dates: readonly (string | null)[]): {
  months: number;
  from: string | null;
  to: string | null;
} {
  const ds = dates.filter((d): d is string => !!d).sort();
  if (!ds.length) return { months: 1, from: null, to: null };
  const from = ds[0]!;
  const to = ds[ds.length - 1]!;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  const months = Math.max(1, Math.round((days / 30.44) * 2) / 2); // nearest half month, never < 1
  return { months, from, to };
}

/** Group spending rows by merchant and summarise exclusions. */
export function summarise(
  files: readonly ParsedFile[],
  index: readonly CompanyIndexEntry[],
): ImportSummary {
  const all = files.flatMap((f) => f.txns);
  const spend = all.filter((t) => !t.excluded);
  const excluded: ImportSummary['excluded'] = {};
  for (const t of all) {
    if (!t.excluded) continue;
    const e = (excluded[t.excluded] ??= { count: 0, total: 0 });
    e.count++;
    e.total += t.amount;
  }
  const byKey = new Map<string, MerchantGroup>();
  for (const t of spend) {
    const m = matchMerchant(t.description, index, t.rawCategory);
    const g = byKey.get(m.key) ?? { ...m, total: 0, count: 0 };
    g.total += t.amount;
    g.count++;
    byKey.set(m.key, g);
  }
  const { months, from, to } = monthsCovered(spend.map((t) => t.date));
  return {
    months,
    from,
    to,
    rows: all.length,
    spendRows: spend.length,
    excluded,
    groups: [...byKey.values()].sort((a, b) => b.total - a.total),
    unreadable: files.reduce((a, f) => a + f.unreadable, 0),
  };
}

export interface CategoryPlanRow {
  categoryId: string;
  monthlySpend: number;
  /** bucket → share of the category, 0–100 (midpoints; the store widens them into ranges) */
  shares: Record<BucketId, number>;
  /** company ids to name inside each bucket */
  named: Partial<Record<BucketId, string[]>>;
  /** merchants with no company record that the user classified — become user companies */
  newCompanies: { name: string; bucket: BucketId }[];
  merchants: { display: string; total: number; bucket: BucketId; companyId: string | null }[];
}

/**
 * Reviewed groups → one row per category: monthly dollars (file total ÷ months) and the bucket
 * split. Groups the user skipped are dropped; overrides win over the detected bucket/category.
 */
export function buildPlan(summary: ImportSummary, monthsOverride?: number): CategoryPlanRow[] {
  const months = Math.max(0.5, monthsOverride ?? summary.months);
  const byCat = new Map<string, CategoryPlanRow>();
  for (const g of summary.groups) {
    if (g.skip) continue;
    const categoryId = g.categoryOverride ?? g.category;
    const bucket = g.bucketOverride ?? g.bucket;
    const row =
      byCat.get(categoryId) ??
      ({
        categoryId,
        monthlySpend: 0,
        shares: { local: 0, regional: 0, major: 0, unknown: 0 },
        named: {},
        newCompanies: [],
        merchants: [],
      } satisfies CategoryPlanRow);
    row.monthlySpend += g.total / months;
    row.shares[bucket] += g.total;
    if (g.companyId) (row.named[bucket] ??= []).push(g.companyId);
    else if (bucket !== 'unknown') row.newCompanies.push({ name: g.display, bucket });
    row.merchants.push({ display: g.display, total: g.total, bucket, companyId: g.companyId });
    byCat.set(categoryId, row);
  }
  for (const row of byCat.values()) {
    const total = BUCKET_IDS.reduce((a, b) => a + row.shares[b], 0);
    for (const b of BUCKET_IDS) row.shares[b] = total > 0 ? (100 * row.shares[b]) / total : 0;
    row.monthlySpend = Math.round(row.monthlySpend);
    row.merchants.sort((a, b) => b.total - a.total);
  }
  return [...byCat.values()].sort((a, b) => b.monthlySpend - a.monthlySpend);
}

/** Parse one file's text end to end. */
export function parseStatement(text: string, delimiter?: string): ParsedFile {
  const table = parseDelimited(text, delimiter);
  const columns = detectColumns(table);
  return toTransactions(table, columns);
}

/** Category label for an id, matching the app's defaults where possible. */
export function categoryLabel(id: string, categories: readonly SpendCategory[]): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}
