/** Page-section numbering helpers (kept out of the component module for fast-refresh purity). */
/**
 * Section numbers for a page whose panels are conditionally shown: pass one flag per section in
 * order (true = detail-only) and get the visible numbering back, so simple mode reads 01, 02, 03…
 * with no gaps where a panel was hidden. Hidden sections get ''.
 */
export function sectionNumbers(detailOnlyFlags: readonly boolean[], detailed: boolean): string[] {
  let n = 0;
  return detailOnlyFlags.map((detailOnly) => {
    if (detailOnly && !detailed) return '';
    n += 1;
    return String(n).padStart(2, '0');
  });
}
