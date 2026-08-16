import { useMemo } from 'react';
import { useCompassStore } from '@/store/useCompassStore';
import { useScores } from '@/store/scoring';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { CategoryCard } from '../CategoryCard';
import { NumberTick } from '@/components/NumberTick';
import { fmt1, signed1 } from '@/lib/format';

/** R8 — the user's own optimal; presets prefill, everything editable. */
export function Step6Optimal() {
  const categories = useCompassStore((s) => s.categories);
  const mode = useCompassStore((s) => s.goalMode);
  const applyPreset = useCompassStore((s) => s.applyTargetPreset);
  const customized = useCompassStore((s) => s.wizard.targetsCustomized);
  const scores = useScores();
  const idxById = useMemo(
    () => Object.fromEntries(scores.target.categories.map((c) => [c.categoryId, c.index])),
    [scores],
  );
  return (
    <>
      <h1 className="mt-[26px] text-[26px]">Define your optimal</h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] text-faint">
        Same controls, now for where you <b className="text-ink">want</b> the money to land.
        Prefilled from the <b className="text-ink">{GOAL_MODE_PRESETS[mode].label}</b> preset —
        every range is yours to change. The projected index updates as you drag.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded border border-ink bg-card px-[18px] py-3">
        <div className="flex gap-6">
          <div>
            <div className="eyebrow">Current</div>
            <div className="font-mono text-2xl">{fmt1(scores.current.index)}</div>
          </div>
          <div>
            <div className="eyebrow">Projected optimal</div>
            <div className="font-mono text-2xl text-brass">
              <NumberTick value={scores.target.index} />
            </div>
          </div>
          <div>
            <div className="eyebrow">Gain</div>
            <div className="font-mono text-2xl text-aligned">
              {signed1(scores.target.index - scores.current.index)}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost !py-1 text-[11px]"
          onClick={() => applyPreset()}
          disabled={!customized}
        >
          Reset all targets to preset
        </button>
      </div>
      {categories.map((c) => (
        <CategoryCard
          key={c.id}
          category={c}
          which="target"
          index={c.monthlySpend > 0 ? idxById[c.id] : undefined}
          showPreset
        />
      ))}
    </>
  );
}
