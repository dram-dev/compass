import { useMemo, useState } from 'react';
import type { Holding, HoldingType, InvestmentBucketId, SleeveId } from '@/engine/types';
import { POLITICAL_PRINCIPLE_ID } from '@/engine/types';
import {
  INVESTMENT_BUCKET_LABELS,
  INVESTMENT_BUCKETS,
  SLEEVE_LABELS,
  SLEEVES,
} from '@/engine/investments';
import { useCompassStore } from '@/store/useCompassStore';
import { useCompanies, useScores } from '@/store/scoring';
import { InvestmentsDisclaimer } from '@/components/Disclaimers';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { fmt1, fmtMoney } from '@/lib/format';

const TYPES: { v: HoldingType; label: string }[] = [
  { v: 'cash', label: 'Cash / deposit' },
  { v: 'fund', label: 'Fund' },
  { v: 'equity', label: 'Equity' },
  { v: 'crypto', label: 'Crypto' },
  { v: 'other', label: 'Other' },
];

function HoldingRow({ h }: { h: Holding }) {
  const update = useCompassStore((s) => s.updateHolding);
  const remove = useCompassStore((s) => s.removeHolding);
  const principles = useCompassStore((s) => s.principles);
  const companies = useCompanies();
  const scores = useScores();
  const view = scores.investments.holdings.find((v) => v.holding.id === h.id);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? Object.values(companies)
          .filter((c) => c.name.toLowerCase().includes(s))
          .slice(0, 6)
      : [];
  }, [q, companies]);
  const company = h.companyId ? companies[h.companyId] : undefined;
  const rated = principles.filter((p) => p.id !== POLITICAL_PRINCIPLE_ID);
  return (
    <li className="card px-4 py-3">
      <div className="grid grid-cols-[1fr_130px_120px_28px] items-center gap-3 max-[640px]:grid-cols-[1fr_28px]">
        <input
          value={h.label}
          onChange={(e) => update(h.id, { label: e.target.value })}
          aria-label="Holding label"
          placeholder="Label (ticker or free text)"
          className="min-w-0 border-0 border-b border-rule bg-transparent py-0.5 text-[13.5px] font-semibold focus:border-brass focus:outline-none"
        />
        <select
          value={h.type}
          onChange={(e) => update(h.id, { type: e.target.value as HoldingType })}
          aria-label="Holding type"
          className="rounded border border-rule bg-paper px-2 py-1 text-[12.5px] max-[640px]:col-start-1"
        >
          {TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="flex items-baseline gap-0.5 font-mono text-faint max-[640px]:col-start-1">
          $
          <input
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={h.amount}
            onChange={(e) => update(h.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
            aria-label={`Amount for ${h.label || 'holding'}`}
            className="w-[90px] border-0 border-b border-rule bg-transparent px-0.5 text-right font-mono text-[13.5px] text-ink focus:border-brass focus:outline-none"
          />
        </span>
        <button
          type="button"
          onClick={() => remove(h.id)}
          aria-label={`Remove ${h.label || 'holding'}`}
          className="h-[22px] w-[22px] justify-self-end rounded-full border border-rule text-faint hover:border-opposed hover:text-opposed max-[640px]:col-start-2 max-[640px]:row-start-1"
        >
          ×
        </button>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1fr] gap-3 text-[12px] max-[640px]:grid-cols-1">
        <label className="grid gap-1">
          <span className="text-faint">Sleeve</span>
          <select
            value={h.sleeve ?? ''}
            onChange={(e) =>
              update(h.id, { sleeve: (e.target.value || undefined) as SleeveId | undefined })
            }
            aria-label="Sleeve"
            className="rounded border border-rule bg-paper px-2 py-1"
          >
            <option value="">Auto ({view ? SLEEVE_LABELS[view.sleeve] : '—'})</option>
            {SLEEVES.map((s) => (
              <option key={s} value={s}>
                {SLEEVE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="relative grid gap-1">
          <span className="text-faint">Match a company (optional)</span>
          {company ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              {company.name}
              <ProvenanceBadge
                provenance={company.ratingsProvenance}
                source={company.source}
                showLink={false}
              />
              <button
                type="button"
                className="text-faint hover:text-opposed"
                onClick={() => update(h.id, { companyId: undefined })}
                aria-label="Clear company match"
              >
                ×
              </button>
            </span>
          ) : (
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              placeholder="type to search…"
              aria-label="Match a company"
              className="rounded border border-dashed border-rule bg-transparent px-2 py-1 font-mono text-[11px] focus:border-brass focus:outline-none"
            />
          )}
          {open && matches.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 top-full z-20 mt-1 w-full rounded border border-ink bg-paper py-1 text-[12px] shadow-lg"
            >
              {matches.map((c) => (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    update(h.id, { companyId: c.id });
                    setQ('');
                    setOpen(false);
                  }}
                  className="cursor-pointer px-3 py-1 hover:bg-card"
                >
                  {c.name} <span className="text-faint">· {c.sector}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="grid gap-1">
          <span className="text-faint">Your optimal bucket for this holding</span>
          <select
            value={h.targetBucket ?? ''}
            onChange={(e) =>
              update(h.id, { targetBucket: (e.target.value || null) as InvestmentBucketId | null })
            }
            aria-label="Target bucket"
            className="rounded border border-rule bg-paper px-2 py-1"
          >
            <option value="">
              Suggested ({view ? INVESTMENT_BUCKET_LABELS[view.targetBucket] : '—'})
            </option>
            {INVESTMENT_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {INVESTMENT_BUCKET_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-faint hover:text-ink">
          Manual ratings{' '}
          {view?.alignment === null ? (
            <span className="text-brass">· unrated → shown as Unknown</span>
          ) : (
            <span className="font-mono">
              · a = {view ? fmt1(view.alignment ?? 0) : '—'} →{' '}
              {view ? INVESTMENT_BUCKET_LABELS[view.currentBucket] : ''}
            </span>
          )}
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {rated.map((p) => (
            <label key={p.id} className="grid grid-cols-[1fr_120px_32px] items-center gap-2">
              <span>{p.label}</span>
              <input
                type="range"
                min={-2}
                max={2}
                step={1}
                value={h.ratings[p.id] ?? 0}
                onChange={(e) =>
                  update(h.id, { ratings: { ...h.ratings, [p.id]: Number(e.target.value) } })
                }
                aria-label={`${p.label} rating for ${h.label || 'holding'}`}
                className="accent-[var(--ink)]"
              />
              <span className="font-mono text-right">
                {h.ratings[p.id] === undefined
                  ? '—'
                  : h.ratings[p.id]! > 0
                    ? `+${h.ratings[p.id]}`
                    : h.ratings[p.id]}
              </span>
            </label>
          ))}
          {Object.keys(h.ratings).length > 0 && (
            <button
              type="button"
              className="chip w-fit hover:border-ink hover:text-ink"
              onClick={() => update(h.id, { ratings: {} })}
            >
              clear ratings
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

export function Step5Investments() {
  const holdings = useCompassStore((s) => s.holdings);
  const addHolding = useCompassStore((s) => s.addHolding);
  const scores = useScores();
  return (
    <>
      <h1 className="mt-[26px] text-[26px]">Investments (optional)</h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] text-faint">
        List holdings by ticker or plain text. Match a company from the dataset or rate the holding
        by hand; unrated money is shown honestly as <b className="text-ink">Unknown</b>. The same
        engine scores it, grouped into sleeves for the flow diagram.
      </p>
      <InvestmentsDisclaimer className="mt-4" />
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded border border-ink bg-card px-[18px] py-3">
        <div>
          <div className="eyebrow">Portfolio</div>
          <div className="font-mono text-2xl">{fmtMoney(scores.investments.total)}</div>
        </div>
        <div className="font-mono text-[12px] text-faint">
          index {fmt1(scores.investments.currentIndex)} → {fmt1(scores.investments.targetIndex)} ·
          unrated {Math.round(scores.investments.unratedShare)}%
        </div>
      </div>
      <ul className="mt-3 grid gap-3">
        {holdings.map((h) => (
          <HoldingRow key={h.id} h={h} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => addHolding()}
        className="mt-3.5 w-full rounded border-[1.5px] border-dashed border-rule py-[13px] text-[12px] font-semibold tracking-[.08em] text-faint hover:border-ink hover:text-ink"
      >
        + ADD A HOLDING
      </button>
      {holdings.length === 0 && (
        <p className="mt-3 text-[12.5px] text-faint">
          No holdings yet — that's fine. Continue to skip this module; the dashboard's Investments
          lens will simply show an empty state.
        </p>
      )}
    </>
  );
}
