/**
 * Delimited-text parsing for user-supplied statement files. Everything happens in the browser —
 * a CSV never leaves the device (§10 local-first).
 *
 * RFC 4180 quoting, plus the practical bits real exports need: BOM, CRLF, quoted newlines,
 * doubled quotes, and delimiter sniffing (`,` `;` tab `|`) because European exports use `;`.
 */
export interface DelimitedTable {
  header: string[];
  rows: string[][];
  delimiter: string;
  /** Rows skipped before the header (some banks emit a title/account block first). */
  preamble: string[];
}

const DELIMITERS = [',', ';', '\t', '|'] as const;

/** Split one line honouring quotes — used only for sniffing; the real parse is char-by-char. */
function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ch && !q) n++;
  }
  return n;
}

/** The delimiter that appears most consistently across the first few non-empty lines. */
export function sniffDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 12);
  if (!lines.length) return ',';
  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const max = Math.max(...counts);
    if (max === 0) continue;
    // consistency beats raw frequency: prefer a delimiter with the same count on most lines
    const mode = counts.sort(
      (a, b) => counts.filter((c) => c === b).length - counts.filter((c) => c === a).length,
    )[0]!;
    const agree = counts.filter((c) => c === mode).length / counts.length;
    const score = agree * 10 + Math.min(mode, 12) / 12;
    if (mode > 0 && score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Parse delimited text into a header and rows. Never throws on malformed input. */
export function parseDelimited(text: string, delimiter?: string): DelimitedTable {
  const src = String(text).replace(/^﻿/, '');
  const d = delimiter ?? sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const pushCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === d) pushCell();
    else if (c === '\n') pushRow();
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) pushRow();
  // Some exports prepend title/blank/account lines: the header is the first row whose width is
  // typical for the file and which is not mostly numeric.
  const widths = rows.map((r) => r.length);
  const typical = widths.length ? mode(widths) : 0;
  const preamble: string[] = [];
  let headerIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const numericish = r.filter((c) => c !== '' && /^[-+$(]?[\d.,]+\)?$/.test(c)).length;
    if (r.length === typical && numericish <= Math.floor(r.length / 2)) {
      headerIdx = i;
      break;
    }
    preamble.push(r.join(d));
  }
  const header = (rows[headerIdx] ?? []).map((h) => h.replace(/\s+/g, ' ').trim());
  return { header, rows: rows.slice(headerIdx + 1), delimiter: d, preamble };
}

function mode(ns: number[]): number {
  const counts = new Map<number, number>();
  for (const n of ns) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = ns[0]!;
  let bestN = 0;
  for (const [v, n] of counts)
    if (n > bestN || (n === bestN && v > best)) {
      best = v;
      bestN = n;
    }
  return best;
}
