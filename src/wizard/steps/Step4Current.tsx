import { useMemo, useState } from 'react';
import { useCompassStore } from '@/store/useCompassStore';
import { useScores } from '@/store/scoring';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { CategoryCard } from '../CategoryCard';
import { CsvImportPanel } from '@/components/CsvImportPanel';
import { fmtMoney } from '@/lib/format';

export function Step4Current() {
  const [importing, setImporting] = useState(false);
  const categories = useCompassStore((s) => s.categories);
  const mode = useCompassStore((s) => s.goalMode);
  const addCategory = useCompassStore((s) => s.addCategory);
  const scores = useScores();
  const total = useMemo(() => categories.reduce((s, c) => s + c.monthlySpend, 0), [categories]);
  const idxById = useMemo(
    () => Object.fromEntries(scores.current.categories.map((c) => [c.categoryId, c.index])),
    [scores],
  );
  return (
    <>
      <h1 className="mt-[26px] text-[26px]">Where does the money go today?</h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] text-faint">
        Set each category's monthly spend, then drag the <b className="text-ink">ranges</b> for how
        much lands with each destination. Honest ranges beat false precision — the engine scores on
        midpoints and carries the band through to your dial. Shares don't need to sum to 100;
        midpoints are <b className="text-ink">renormalized</b> live below each card.
      </p>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 rounded border border-ink bg-card px-[18px] py-3">
        <div>
          <div className="eyebrow">Monthly discretionary total</div>
          <div className="font-mono text-2xl">{fmtMoney(total)}</div>
        </div>
        <span className="rounded-full border border-brass px-2.5 py-[2.5px] font-mono text-[10.5px] uppercase text-brass">
          Goal mode · {GOAL_MODE_PRESETS[mode].label} (step 1)
        </span>
      </div>
      {categories.map((c) => (
        <CategoryCard
          key={c.id}
          category={c}
          which="current"
          index={c.monthlySpend > 0 ? idxById[c.id] : undefined}
        />
      ))}
      <button
        type="button"
        onClick={() => addCategory()}
        className="mt-3.5 w-full rounded border-[1.5px] border-dashed border-rule py-[13px] text-[12px] font-semibold tracking-[.08em] text-faint hover:border-ink hover:text-ink"
      >
        + ADD A CATEGORY
      </button>
      <div className="mt-4 rounded border border-dashed border-rule px-4 py-3 text-[12px] text-faint">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <b className="text-ink">Import a bank or card CSV</b> — Compass reads it in this tab,
            groups the transactions by merchant, and fills in the totals and the mix. You review
            everything before it applies.
          </span>
          <button
            type="button"
            className="btn btn-ghost !py-1 text-[11px]"
            aria-expanded={importing}
            onClick={() => setImporting((v) => !v)}
          >
            {importing ? 'Hide importer' : 'Import CSV'}
          </button>
        </div>
        {importing && <CsvImportPanel onDone={() => setImporting(false)} />}
      </div>
      <div className="callout">
        Naming merchants sharpens the political mapping. Picks from the sample list carry a{' '}
        <b className="text-ink">Sample — verify</b> rating you can override; anything you type in
        starts <b className="text-ink">unrated</b> until you rate it. Everything stays on this
        device.
      </div>
    </>
  );
}
