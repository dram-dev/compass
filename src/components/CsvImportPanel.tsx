import { useMemo, useRef, useState } from 'react';
import { useCompassStore } from '@/store/useCompassStore';
import { useCompanies } from '@/store/scoring';
import {
  buildCompanyIndex,
  buildPlan,
  EXCLUDE_LABELS,
  parseStatement,
  summarise,
  type CategoryPlanRow,
  type ImportSummary,
  type MerchantGroup,
  type ParsedFile,
} from '@/lib/transactions';
import { BUCKET_IDS, BUCKET_LABELS, type BucketId } from '@/engine/types';
import { fmtMoney } from '@/lib/format';

interface Loaded {
  name: string;
  file: ParsedFile;
}

const bucketChip = (b: BucketId) =>
  b === 'unknown' ? 'border-unknown text-unknown' : 'border-rule';

/**
 * Statement import (R10 / ASSUMPTIONS #76). Files are read with FileReader and parsed in this tab —
 * nothing is uploaded, and the file is dropped as soon as the numbers are read.
 *
 * The flow is deliberately review-first: the importer derives dollars and categories, recognises
 * known chains, and then asks the user to classify what it could not identify. It never guesses
 * whether an unfamiliar merchant is local or major, and it never applies anything without a preview.
 */
export function CsvImportPanel({ onDone }: { onDone?: () => void }) {
  const categories = useCompassStore((s) => s.categories);
  const applyImport = useCompassStore((s) => s.applyTransactionImport);
  const companies = useCompanies();
  const index = useMemo(() => buildCompanyIndex(Object.values(companies)), [companies]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [monthsOverride, setMonthsOverride] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [showAllMerchants, setShowAllMerchants] = useState(false);
  const [tick, setTick] = useState(0); // re-render after mutating group overrides

  const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const knownCategories = new Set(categories.map((c) => c.id));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setApplied(null);
    const next: Loaded[] = [];
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const parsed = parseStatement(text);
        if (
          parsed.columns.description === null ||
          (parsed.columns.amount === null && parsed.columns.debit === null)
        ) {
          setError(
            `Couldn't find a description and amount column in “${f.name}”. Supported: most bank/card CSV exports (Chase, Capital One, Amex, and generic date/description/amount files).`,
          );
          continue;
        }
        if (!parsed.txns.length) {
          setError(`No transaction rows found in “${f.name}”.`);
          continue;
        }
        next.push({ name: f.name, file: parsed });
      } catch (e) {
        setError(`Couldn't read “${f.name}”: ${e instanceof Error ? e.message : 'unknown error'}.`);
      }
    }
    if (!next.length) return;
    const all = [...loaded, ...next];
    setLoaded(all);
    setSummary(
      summarise(
        all.map((l) => l.file),
        index,
      ),
    );
    setMonthsOverride(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const months = monthsOverride ?? summary?.months ?? 1;
  const plan = useMemo(
    () => (summary ? buildPlan(summary, months) : []),
    // `tick` forces recompute after in-place override edits
    [summary, months, tick],
  );
  const planTotal = plan.reduce((a, r) => a + r.monthlySpend, 0);
  const unmatched = summary?.groups.filter((g) => g.method === 'unmatched' && !g.skip) ?? [];
  const unmatchedTotal = unmatched.reduce((a, g) => a + g.total, 0);
  const spendTotal = summary?.groups.reduce((a, g) => a + (g.skip ? 0 : g.total), 0) ?? 0;

  function setGroup(g: MerchantGroup, patch: Partial<MerchantGroup>) {
    Object.assign(g, patch);
    setTick((t) => t + 1);
  }

  function reset() {
    setLoaded([]);
    setSummary(null);
    setMonthsOverride(null);
    setError(null);
    setShowAllMerchants(false);
  }

  function apply() {
    const usable = plan.filter((r) => knownCategories.has(r.categoryId));
    const dropped = plan.length - usable.length;
    const res = applyImport(usable as CategoryPlanRow[]);
    setApplied(
      `Applied ${fmtMoney(Math.round(res.monthlyTotal))}/month across ${res.categories} categor${res.categories === 1 ? 'y' : 'ies'}` +
        (res.created ? `, naming ${res.created} new merchant${res.created === 1 ? '' : 's'}` : '') +
        (dropped ? `. ${dropped} row(s) had no matching category and were skipped` : '') +
        '. Your ranges are editable as always.',
    );
    reset();
    onDone?.();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="text-[12px] file:mr-3 file:cursor-pointer file:rounded file:border file:border-ink file:bg-transparent file:px-3 file:py-1.5 file:font-mono file:text-[11px] file:uppercase file:tracking-wide2"
          aria-label="Choose statement CSV files"
        />
        {loaded.length > 0 && (
          <button type="button" className="btn btn-ghost !py-1 text-[11px]" onClick={reset}>
            Clear
          </button>
        )}
      </div>
      <p className="mt-2 text-[11.5px] text-faint">
        <span className="text-brass">⌂ </span>
        Read in this browser tab and discarded once the totals are computed — the file is never
        uploaded, and only the monthly figures you apply are saved (on this device).
      </p>

      {error && (
        <div role="alert" className="callout !border-opposed">
          {error}
        </div>
      )}
      {applied && (
        <div role="status" className="callout">
          {applied}
        </div>
      )}

      {summary && (
        <>
          <div className="mt-4 grid gap-3 rounded border border-ink bg-card px-4 py-3 text-[12.5px]">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="font-mono">{loaded.map((l) => l.name).join(', ')}</span>
              <span className="text-faint">
                {summary.rows} rows · {summary.spendRows} spending · {summary.groups.length}{' '}
                merchants
              </span>
              {summary.from && (
                <span className="text-faint">
                  {summary.from} → {summary.to}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <label htmlFor="months" className="text-faint">
                Months of data
              </label>
              <input
                id="months"
                type="number"
                min={0.5}
                step={0.5}
                value={months}
                onChange={(e) => setMonthsOverride(Math.max(0.5, Number(e.target.value) || 1))}
                className="w-[70px] rounded border border-rule bg-transparent px-2 py-0.5 font-mono text-[12px]"
              />
              <span className="text-faint">
                — totals are divided by this to get a monthly figure
                {summary.from
                  ? ` (detected from the date range)`
                  : ` (no dates found; assuming one month)`}
                .
              </span>
            </div>
            {Object.keys(summary.excluded).length > 0 && (
              <div className="text-[11.5px] text-faint">
                Excluded as non-spending:{' '}
                {Object.entries(summary.excluded)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(
                    ([id, v]) =>
                      `${EXCLUDE_LABELS[id] ?? id} ${v.count} (${fmtMoney(Math.round(v.total))})`,
                  )
                  .join(' · ')}
                {summary.unreadable > 0 && ` · ${summary.unreadable} unreadable row(s)`}
              </div>
            )}
          </div>

          {unmatched.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px]">
                  Classify {unmatched.length} unrecognised merchant
                  {unmatched.length === 1 ? '' : 's'}
                </h3>
                <span className="font-mono text-[11.5px] text-faint">
                  {fmtMoney(Math.round(unmatchedTotal))} ·{' '}
                  {spendTotal > 0 ? Math.round((100 * unmatchedTotal) / spendTotal) : 0}% of spend
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-faint">
                Compass doesn't guess whether a merchant is a local independent or a chain. Biggest
                first — anything you leave alone stays <b className="text-ink">Unknown</b> and is
                reported as unassessed, never hidden.
              </p>
              <ul
                aria-label="Unrecognised merchants"
                className="mt-2 divide-y divide-rule border-y border-rule"
              >
                {(showAllMerchants ? unmatched : unmatched.slice(0, 8)).map((g) => (
                  <li key={g.key} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                    <span className="min-w-[150px] flex-1">
                      {g.display}
                      <span className="ml-2 font-mono text-[11px] text-faint">
                        {fmtMoney(Math.round(g.total))} · {g.count}×
                      </span>
                    </span>
                    <select
                      aria-label={`Category for ${g.display}`}
                      value={g.categoryOverride ?? g.category}
                      onChange={(e) => setGroup(g, { categoryOverride: e.target.value })}
                      className="rounded border border-rule bg-transparent px-1.5 py-0.5 text-[11.5px]"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span
                      role="group"
                      aria-label={`Destination for ${g.display}`}
                      className="flex gap-1"
                    >
                      {BUCKET_IDS.map((b) => {
                        const active = (g.bucketOverride ?? g.bucket) === b;
                        return (
                          <button
                            key={b}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setGroup(g, { bucketOverride: b })}
                            className={`rounded-full border px-2 py-[1px] font-mono text-[10.5px] ${
                              active ? 'border-ink bg-ink text-paper' : bucketChip(b)
                            }`}
                            title={BUCKET_LABELS[b]}
                          >
                            {b === 'unknown' ? '?' : BUCKET_LABELS[b].split(' ')[0]}
                          </button>
                        );
                      })}
                    </span>
                    <button
                      type="button"
                      className="chip hover:border-opposed hover:text-opposed"
                      onClick={() => setGroup(g, { skip: true })}
                      title="Leave this merchant out of the import"
                    >
                      skip
                    </button>
                  </li>
                ))}
              </ul>
              {unmatched.length > 8 && (
                <button
                  type="button"
                  className="mt-2 text-[11.5px] underline text-faint hover:text-ink"
                  onClick={() => setShowAllMerchants((v) => !v)}
                >
                  {showAllMerchants
                    ? 'Show only the largest 8'
                    : `Show all ${unmatched.length} (smallest are usually one-offs)`}
                </button>
              )}
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-[15px]">Preview — what will be applied</h3>
            <p className="mt-1 text-[11.5px] text-faint">
              Monthly spend and the current-mix split per category. Applying replaces these two
              things for the categories listed; everything else you've set is untouched, and every
              range stays editable.
            </p>
            <table
              aria-label="Import preview by category"
              className="mt-2 w-full border-collapse text-[12.5px]"
            >
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[10.5px] uppercase tracking-wide2 text-faint">
                  <th className="py-1.5 pr-2 font-normal">Category</th>
                  <th className="py-1.5 pr-2 text-right font-normal">Monthly</th>
                  <th className="py-1.5 pr-2 font-normal">Local</th>
                  <th className="py-1.5 pr-2 font-normal">Regional</th>
                  <th className="py-1.5 pr-2 font-normal">Major</th>
                  <th className="py-1.5 font-normal">Unknown</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((r) => (
                  <tr key={r.categoryId} className="border-b border-rule align-top">
                    <td className="py-1.5 pr-2">
                      {knownCategories.has(r.categoryId) ? (
                        catLabel(r.categoryId)
                      ) : (
                        <span title="No category with this id — this row is skipped">
                          {r.categoryId} <span className="text-opposed">(no category)</span>
                        </span>
                      )}
                      <div className="text-[11px] text-faint">
                        {r.merchants
                          .slice(0, 4)
                          .map((m) => m.display)
                          .join(', ')}
                        {r.merchants.length > 4 ? ` +${r.merchants.length - 4}` : ''}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">{fmtMoney(r.monthlySpend)}</td>
                    {BUCKET_IDS.map((b) => (
                      <td key={b} className="py-1.5 pr-2 font-mono">
                        {r.shares[b] > 0 ? `${Math.round(r.shares[b])}%` : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-mono">
                  <td className="py-1.5 pr-2 text-[11px] uppercase tracking-wide2 text-faint">
                    Total
                  </td>
                  <td className="py-1.5 pr-2 text-right">{fmtMoney(Math.round(planTotal))}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-pri" onClick={apply} disabled={!plan.length}>
                Apply to my categories
              </button>
              <span className="text-[11.5px] text-faint">
                Nothing is saved until you press this.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
