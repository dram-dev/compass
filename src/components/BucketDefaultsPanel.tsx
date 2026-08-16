import { BUCKET_IDS, BUCKET_LABELS, POLITICAL_PRINCIPLE_ID } from '@/engine/types';
import { useCompassStore } from '@/store/useCompassStore';
import { BucketDot } from './BucketDot';

/** §6.2 "Advanced" panel — bucket-default ratings, user-editable (R8). */
export function BucketDefaultsPanel() {
  const principles = useCompassStore((s) => s.principles);
  const defaults = useCompassStore((s) => s.bucketDefaults);
  const setDefault = useCompassStore((s) => s.setBucketDefault);
  const reset = useCompassStore((s) => s.resetBucketDefaults);
  const rows = principles.filter((p) => p.id !== POLITICAL_PRINCIPLE_ID);
  return (
    <div className="card mt-3 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2.5 text-[11px] uppercase tracking-[.12em] text-faint">
        Bucket-default ratings (−2 … +2)
        <span className="flex-1" />
        <button type="button" className="chip hover:border-ink hover:text-ink" onClick={reset}>
          reset to shipped defaults
        </button>
      </div>
      <p className="px-4 pt-3 text-[12px] text-faint">
        Used for any bucket portion without a rated, named merchant. Political alignment is derived
        from each company's lean and is 0 for unnamed portions — no bucket is presumed to lean
        anywhere.
      </p>
      <table className="mt-2 w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-[.1em] text-faint">
            <th className="px-4 py-2 font-normal">Principle</th>
            {BUCKET_IDS.map((b) => (
              <th key={b} className="px-2 py-2 font-normal">
                <BucketDot bucket={b} />
                {BUCKET_LABELS[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-rule">
              <td className="px-4 py-1.5">{p.label}</td>
              {BUCKET_IDS.map((b) => (
                <td key={b} className="px-2 py-1.5">
                  {b === 'unknown' ? (
                    <span
                      className="font-mono text-faint"
                      title="Unknown is always 0 (never assessed)"
                    >
                      0
                    </span>
                  ) : (
                    <input
                      type="number"
                      min={-2}
                      max={2}
                      step={1}
                      value={defaults[b]?.[p.id] ?? 0}
                      onChange={(e) => setDefault(b, p.id, Number(e.target.value))}
                      aria-label={`${BUCKET_LABELS[b]} default rating for ${p.label}`}
                      className="w-14 rounded border border-rule bg-paper px-1.5 py-0.5 text-right font-mono text-[12px]"
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
