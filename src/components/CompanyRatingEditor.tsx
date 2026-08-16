import { useMemo } from 'react';
import {
  BUCKET_IDS,
  BUCKET_LABELS,
  POLITICAL_PRINCIPLE_ID,
  type BucketId,
  type Company,
} from '@/engine/types';
import { useCompassStore } from '@/store/useCompassStore';
import { Modal } from './Modal';
import { ProvenanceBadge } from './ProvenanceBadge';

const LEAN_OPTIONS: { v: number | null; label: string }[] = [
  { v: null, label: 'Unknown (not assessed)' },
  { v: -2, label: '−2 · strongly conservative-leaning giving' },
  { v: -1, label: '−1 · leans conservative' },
  { v: 0, label: '0 · balanced / mixed' },
  { v: 1, label: '+1 · leans progressive' },
  { v: 2, label: '+2 · strongly progressive-leaning giving' },
];

/**
 * §10.3 / R8 — edit any company's ratings, lean and bucket. Edits are stored as overrides with
 * provenance 'user' and win everywhere. Political axis convention: ASSUMPTIONS #17.
 */
export function CompanyRatingEditor({
  company,
  open,
  onClose,
}: {
  company: Company | null;
  open: boolean;
  onClose: () => void;
}) {
  const principles = useCompassStore((s) => s.principles);
  const overrides = useCompassStore((s) => (company ? s.companyOverrides[company.id] : undefined));
  const setOverride = useCompassStore((s) => s.setCompanyOverride);
  const clearOverride = useCompassStore((s) => s.clearCompanyOverride);
  const bucketDefaults = useCompassStore((s) => s.bucketDefaults);
  const rated = useMemo(
    () => principles.filter((p) => p.id !== POLITICAL_PRINCIPLE_ID),
    [principles],
  );
  if (!company) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Rate ${company.name}`}>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-faint">
        <span>{company.sector}</span>
        <ProvenanceBadge
          provenance={overrides ? 'user' : company.ratingsProvenance}
          source={company.source}
        />
        {company.fictional && <span className="chip">fictional archetype</span>}
      </div>
      <p className="mt-3 text-[12.5px] text-faint">
        Ratings run −2 (strongly against this principle) to +2 (strongly for). Blank = use the
        bucket default. Your edits are stored on this device with a{' '}
        <b className="text-ink">Yours</b> badge and override sample values everywhere.
      </p>
      <div className="mt-4 grid gap-3">
        <label className="grid grid-cols-[1fr_auto] items-center gap-3 text-[13px]">
          <span>Default bucket</span>
          <select
            className="rounded border border-rule bg-paper px-2 py-1 text-[13px]"
            value={company.bucketDefault}
            onChange={(e) => setOverride(company.id, { bucketDefault: e.target.value as BucketId })}
          >
            {BUCKET_IDS.map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        {rated.map((p) => {
          const v = company.ratings[p.id];
          const fallback = bucketDefaults[company.bucketDefault]?.[p.id] ?? 0;
          return (
            <div key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-[13px]">
              <label htmlFor={`rate-${p.id}`}>
                {p.label}
                <span className="ml-2 font-mono text-[11px] text-faint">
                  {v === undefined
                    ? `default ${fallback >= 0 ? '+' : ''}${fallback}`
                    : `${v >= 0 ? '+' : ''}${v}`}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`rate-${p.id}`}
                  type="range"
                  min={-2}
                  max={2}
                  step={1}
                  value={v ?? fallback}
                  onChange={(e) =>
                    setOverride(company.id, { ratings: { [p.id]: Number(e.target.value) } })
                  }
                  aria-valuetext={`${v ?? fallback}`}
                  className="w-40 accent-[var(--ink)]"
                />
              </div>
            </div>
          );
        })}
        <label className="grid grid-cols-[1fr_auto] items-center gap-3 text-[13px]">
          <span>
            Political-support lean
            <span className="ml-2 font-mono text-[11px] text-faint">verify before rating</span>
          </span>
          <select
            className="max-w-[260px] rounded border border-rule bg-paper px-2 py-1 text-[13px]"
            value={
              company.political.leanScore === null ? 'null' : String(company.political.leanScore)
            }
            onChange={(e) =>
              setOverride(company.id, {
                political: {
                  leanScore: e.target.value === 'null' ? null : Number(e.target.value),
                  confidence: 'med',
                },
              })
            }
          >
            {LEAN_OPTIONS.map((o) => (
              <option key={String(o.v)} value={o.v === null ? 'null' : String(o.v)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11.5px] text-faint">{company.political.sourceHint}</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => clearOverride(company.id)}
          disabled={!overrides}
        >
          Reset to sample values
        </button>
        <button type="button" className="btn btn-pri" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
