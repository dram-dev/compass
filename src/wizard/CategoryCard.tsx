import { useMemo } from 'react';
import { BUCKET_IDS, BUCKET_LABELS, type BucketId, type SpendCategory } from '@/engine/types';
import { midpoints } from '@/engine/allocation';
import { useCompassStore } from '@/store/useCompassStore';
import { DualRange } from '@/components/DualRange';
import { BucketDot } from '@/components/BucketDot';
import { BUCKET_COLOR } from '@/lib/bucketColors';
import { MerchantPicker } from './MerchantPicker';
import { fmt1 } from '@/lib/format';

interface Props {
  category: SpendCategory;
  which: 'current' | 'target';
  index?: number; // per-category alignment index to display (optional)
  showPreset?: boolean;
}

/** R2 — one category: spend, four dual-range buckets, renormalized midpoint bar, merchant naming. */
export function CategoryCard({ category, which, index, showPreset }: Props) {
  const rename = useCompassStore((s) => s.renameCategory);
  const setSpend = useCompassStore((s) => s.setCategorySpend);
  const setRange = useCompassStore((s) => s.setRange);
  const remove = useCompassStore((s) => s.removeCategory);
  const applyPreset = useCompassStore((s) => s.applyTargetPreset);
  const allocs = category[which];
  const mids = useMemo(() => midpoints(allocs), [allocs]);
  const editable = which === 'current';

  return (
    <div className="card mt-3.5 px-[18px] py-4" data-testid={`category-card-${category.id}`}>
      <div className="flex items-baseline gap-3">
        {editable ? (
          <input
            value={category.label}
            onChange={(e) => rename(category.id, e.target.value)}
            aria-label="Category name"
            className="min-w-0 flex-1 border-0 border-b border-dashed border-transparent bg-transparent pb-0.5 text-[13px] font-semibold uppercase tracking-[.06em] focus:border-rule focus:outline-none max-[640px]:text-[16px]"
          />
        ) : (
          <h3 className="min-w-0 flex-1 font-sans text-[13px] font-semibold uppercase tracking-[.06em]">
            {category.label}
          </h3>
        )}
        <span className="flex items-baseline gap-0.5 font-mono text-faint">
          <span>$</span>
          {editable ? (
            <input
              type="number"
              min={0}
              step={10}
              inputMode="numeric"
              value={category.monthlySpend}
              onChange={(e) => setSpend(category.id, Number(e.target.value))}
              aria-label={`Monthly spend for ${category.label}`}
              className="w-[70px] border-0 border-b border-rule bg-transparent px-0.5 py-px text-right font-mono text-[14px] text-ink focus:border-brass focus:outline-none max-[640px]:w-[86px] max-[640px]:text-[16px]"
            />
          ) : (
            <span className="text-[14px] text-ink">
              {category.monthlySpend.toLocaleString('en-US')}
            </span>
          )}
          <span className="text-[10.5px]">/mo</span>
        </span>
        {index !== undefined && (
          <span
            className="font-mono text-[12px] text-faint"
            title="Category alignment index (0–100)"
          >
            idx <b className="text-ink">{fmt1(index)}</b>
          </span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => remove(category.id)}
            title="Remove category"
            aria-label={`Remove ${category.label}`}
            className="h-[22px] w-[22px] rounded-full border border-rule text-[12px] leading-none text-faint hover:border-opposed hover:text-opposed max-[640px]:h-[30px] max-[640px]:w-[30px]"
          >
            ×
          </button>
        )}
        {showPreset && (
          <button
            type="button"
            onClick={() => applyPreset(category.id)}
            className="chip hover:border-ink hover:text-ink"
          >
            reset to preset
          </button>
        )}
      </div>

      {BUCKET_IDS.map((b) => {
        const a = allocs.find((x) => x.bucket === b) ?? {
          bucket: b,
          rangePct: [0, 0] as [number, number],
          namedCompanyIds: [],
        };
        const [lo, hi] = a.rangePct;
        return (
          <div
            key={b}
            className="mt-[9px] grid grid-cols-[158px_1fr_116px] items-center gap-3 max-[560px]:grid-cols-[120px_1fr] max-[560px]:gap-y-0"
          >
            <span className="text-[12px]">
              <BucketDot bucket={b} />% {BUCKET_LABELS[b]}
            </span>
            <DualRange
              value={[lo, hi]}
              onChange={(v) => setRange(category.id, which, b, v)}
              color={BUCKET_COLOR[b]}
              hatch={b === 'unknown'}
              label={`${BUCKET_LABELS[b]} share of ${category.label}`}
            />
            <span className="text-right font-mono text-[10.5px] text-faint max-[560px]:col-span-2 max-[560px]:-mt-1 max-[560px]:text-left">
              {lo}–{hi}% · mid {((lo + hi) / 2).toFixed(1)}
            </span>
          </div>
        );
      })}

      <div className="mt-3.5">
        <div className="mb-[5px] flex justify-between text-[10.5px] uppercase tracking-[.1em] text-faint">
          <span>Renormalized midpoints</span>
          <span>Σ 100</span>
        </div>
        <div
          className="flex h-[22px] overflow-hidden rounded border border-rule"
          role="img"
          aria-label={BUCKET_IDS.map((b) => `${BUCKET_LABELS[b]} ${fmt1(mids[b])}%`).join(', ')}
        >
          {BUCKET_IDS.map((b) => (
            <span
              key={b}
              className={`flex min-w-0 items-center justify-center font-mono text-[10px] transition-[width] duration-fade ${b === 'unknown' ? 'hatch text-ink' : 'text-paper'}`}
              style={{
                width: `${mids[b]}%`,
                background: b === 'unknown' ? undefined : BUCKET_COLOR[b],
              }}
              title={`${BUCKET_LABELS[b]} ${fmt1(mids[b])}%`}
            >
              {mids[b] >= 13 ? `${Math.round(mids[b])}%` : ''}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-3 text-[12px]" open={allocs.some((a) => a.namedCompanyIds.length > 0)}>
        <summary className="cursor-pointer select-none text-faint hover:text-ink">
          {which === 'current'
            ? 'Name merchants (sharpens the political mapping)'
            : 'Name where you would shift to'}
        </summary>
        <div className="mt-1 grid gap-2">
          {(['local', 'regional', 'major', 'unknown'] as BucketId[])
            .filter((b) => b !== 'unknown')
            .map((b) => (
              <div
                key={b}
                className="grid grid-cols-[130px_1fr] items-start gap-2 max-[560px]:grid-cols-1"
              >
                <span className="pt-1 text-[11px] text-faint">
                  <BucketDot bucket={b} />
                  {BUCKET_LABELS[b]}
                </span>
                <MerchantPicker
                  categoryId={category.id}
                  which={which}
                  bucket={b}
                  namedCompanyIds={allocs.find((x) => x.bucket === b)?.namedCompanyIds ?? []}
                />
              </div>
            ))}
        </div>
      </details>
    </div>
  );
}
