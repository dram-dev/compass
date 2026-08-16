import { useCompassStore } from '@/store/useCompassStore';
import { Segmented } from '@/components/Segmented';

type Dir = 'plus' | 'minus' | 'zero';
const OPTIONS = [
  { value: 'plus' as Dir, label: 'Progressive / Democratic-leaning giving is aligned' },
  { value: 'minus' as Dir, label: 'Conservative / Republican-leaning giving is aligned' },
  { value: 'zero' as Dir, label: 'Neither — issue-based only' },
];

/** §7 step 3 — optional, explicitly private political preference (§6.4). */
export function Step3Political() {
  const political = useCompassStore((s) => s.political);
  const setPolitical = useCompassStore((s) => s.setPolitical);
  const setStep = useCompassStore((s) => s.setWizardStep);
  const dir: Dir = !political.configured
    ? 'zero'
    : political.direction === 1
      ? 'plus'
      : political.direction === -1
        ? 'minus'
        : 'zero';
  return (
    <>
      <h1 className="mt-[26px] text-[26px]">Political preference — optional and private</h1>
      <p className="mt-2 max-w-[62ch] text-[13.5px] text-faint">
        This is stored <b className="text-ink">only on this device</b> and used only to orient the
        "relative to you" displays (Aligned / Mixed / Opposed / Unknown). Compass never assumes a
        direction, never shows party colors, and never sends this anywhere. Skip it and every
        political panel simply reads "not configured".
      </p>
      <p className="mt-3 max-w-[62ch] text-[12.5px] text-faint">
        Sample data records a company's donation profile on a coarse −2…+2 axis (negative =
        conservative/Republican-leaning, positive = progressive/Democratic-leaning; low confidence;
        fictional archetypes only). Which end do you consider aligned with you?
      </p>
      <div className="mt-5">
        <Segmented<Dir>
          options={OPTIONS}
          value={dir}
          onChange={(v) =>
            setPolitical({
              configured: v !== 'zero',
              direction: v === 'plus' ? 1 : v === 'minus' ? -1 : 0,
              intensity: political.intensity,
            })
          }
          ariaLabel="Which end of the political axis is aligned with you?"
        />
      </div>
      <label
        className={`mt-6 block max-w-md text-[13px] ${political.configured ? '' : 'opacity-50'}`}
      >
        <span className="flex justify-between">
          <span>How strongly should political exposure feed the score?</span>
          <span className="font-mono text-faint">{Math.round(political.intensity * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(political.intensity * 100)}
          disabled={!political.configured}
          onChange={(e) => setPolitical({ ...political, intensity: Number(e.target.value) / 100 })}
          aria-label="Political intensity"
          className="mt-1 w-full accent-[var(--ink)]"
        />
        <span className="text-[11.5px] text-faint">
          Scales the derived "Political alignment" rating; the Aligned/Opposed classification itself
          is not scaled.
        </span>
      </label>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setPolitical({ configured: false, direction: 0, intensity: political.intensity });
            setStep(4);
          }}
        >
          Skip this step
        </button>
      </div>
    </>
  );
}
