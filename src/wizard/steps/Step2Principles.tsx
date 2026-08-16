import { useMemo, useState } from 'react';
import { PRINCIPLE_LIBRARY } from '@/data/principles';
import { normalizeWeights } from '@/engine/normalize';
import { POLITICAL_PRINCIPLE_ID } from '@/engine/types';
import { useCompassStore } from '@/store/useCompassStore';

export function Step2Principles() {
  const principles = useCompassStore((s) => s.principles);
  const setWeight = useCompassStore((s) => s.setPrincipleWeight);
  const addLib = useCompassStore((s) => s.addLibraryPrinciple);
  const addCustom = useCompassStore((s) => s.addCustomPrinciple);
  const remove = useCompassStore((s) => s.removePrinciple);
  const political = useCompassStore((s) => s.political);
  const [custom, setCustom] = useState('');
  const norm = useMemo(() => normalizeWeights(principles), [principles]);
  const missing = PRINCIPLE_LIBRARY.filter((d) => !principles.some((p) => p.id === d.id));

  return (
    <>
      <h1 className="mt-[26px] text-[26px]">Which principles matter, and how much?</h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] text-faint">
        Weights are relative — the live share on the right is what the engine uses. Add your own
        principle if the library misses something; you can rate merchants on it later.
      </p>
      <ul className="mt-5 grid gap-3">
        {principles.map((p) => (
          <li
            key={p.id}
            className="card grid grid-cols-[1fr_180px_64px_28px] items-center gap-3 px-4 py-3 max-[640px]:grid-cols-[1fr_64px_28px]"
          >
            <div>
              <label htmlFor={`w-${p.id}`} className="text-[13.5px] font-semibold">
                {p.label}
                {p.custom && <span className="chip ml-2">custom</span>}
              </label>
              <div className="text-[12px] text-faint">
                {p.description ??
                  PRINCIPLE_LIBRARY.find((d) => d.id === p.id)?.description ??
                  (p.id === POLITICAL_PRINCIPLE_ID
                    ? 'Relative to your step 3 preference.'
                    : 'Your own principle.')}
                {p.id === POLITICAL_PRINCIPLE_ID && !political.configured && p.weight > 0 && (
                  <span className="text-brass"> Set up in step 3 or this contributes 0.</span>
                )}
              </div>
              <input
                id={`w-${p.id}`}
                type="range"
                min={0}
                max={100}
                value={p.weight}
                onChange={(e) => setWeight(p.id, Number(e.target.value))}
                aria-valuetext={`${p.weight} of 100`}
                className="mt-1 hidden w-full accent-[var(--ink)] max-[640px]:block"
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={p.weight}
              onChange={(e) => setWeight(p.id, Number(e.target.value))}
              aria-label={`${p.label} weight`}
              aria-valuetext={`${p.weight} of 100`}
              className="w-full accent-[var(--ink)] max-[640px]:hidden"
            />
            <span className="text-right font-mono text-[12px]">
              {p.weight}
              <span className="block text-[10.5px] text-faint">
                {Math.round((norm[p.id] ?? 0) * 100)}% share
              </span>
            </span>
            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label={`Remove ${p.label}`}
              className="h-[22px] w-[22px] rounded-full border border-rule text-faint hover:border-opposed hover:text-opposed"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {missing.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => addLib(d.id, 20)}
            className="chip hover:border-ink hover:text-ink"
          >
            + {d.label}
          </button>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) {
              addCustom(custom.trim(), 20);
              setCustom('');
            }
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="+ add your own principle…"
            aria-label="Custom principle name"
            className="w-[210px] rounded-full border border-dashed border-rule bg-transparent px-[11px] py-[3.5px] font-mono text-[10.5px] focus:border-brass focus:outline-none max-[640px]:text-[16px]"
          />
          <button type="submit" className="btn !px-3 !py-1 text-[11px]" disabled={!custom.trim()}>
            Add
          </button>
        </form>
      </div>
      {principles.every((p) => p.weight === 0) && (
        <div className="callout">
          All weights are zero — every destination scores the same. Give at least one principle
          weight.
        </div>
      )}
    </>
  );
}
