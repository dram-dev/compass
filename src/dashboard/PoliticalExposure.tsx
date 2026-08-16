import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PoliticalClass } from '@/engine/types';
import type { PoliticalContributor, PoliticalExposure as Exposure } from '@/engine/political';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { VERIFY_SOURCES } from '@/data/verifySources';
import { fmtMoney } from '@/lib/format';

const CLASSES: { id: PoliticalClass; label: string; color: string }[] = [
  { id: 'aligned', label: 'Aligned', color: 'var(--aligned)' },
  { id: 'mixed', label: 'Mixed', color: 'var(--mixed)' },
  { id: 'opposed', label: 'Opposed', color: 'var(--opposed)' },
  { id: 'unknown', label: 'Unknown', color: 'var(--unknown)' },
];

function Bar({ label, exposure }: { label: string; exposure: Exposure }) {
  return (
    <div className="mt-[18px]">
      <div className="mb-1.5 text-[11px] uppercase tracking-wide2 text-faint">{label}</div>
      <svg
        viewBox="0 0 760 36"
        role="img"
        aria-label={`${label} political exposure: ${CLASSES.map((c) => `${c.label} ${Math.round(exposure.shares[c.id])}%`).join(', ')}`}
        className="w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="pol-hatch"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="10" height="10" fill="var(--unknown)" />
            <rect width="5" height="10" fill="#b8bdb0" />
          </pattern>
        </defs>
        {(() => {
          let x = 0;
          return CLASSES.map((c) => {
            const w = (exposure.shares[c.id] / 100) * 760;
            const el = (
              <g key={c.id}>
                <rect
                  x={x}
                  y={0}
                  width={w}
                  height={36}
                  fill={c.id === 'unknown' ? 'url(#pol-hatch)' : c.color}
                />
                {w > 60 && (
                  <text
                    x={x + w / 2}
                    y={22}
                    fontSize={11}
                    textAnchor="middle"
                    fill={c.id === 'unknown' ? 'var(--ink)' : 'var(--paper)'}
                  >
                    {c.label} {Math.round(exposure.shares[c.id])}%
                  </text>
                )}
                {w <= 60 && w > 26 && (
                  <text
                    x={x + w / 2}
                    y={22}
                    fontSize={10}
                    textAnchor="middle"
                    fill={c.id === 'unknown' ? 'var(--ink)' : 'var(--paper)'}
                  >
                    {Math.round(exposure.shares[c.id])}%
                  </text>
                )}
              </g>
            );
            x += w;
            return el;
          });
        })()}
        <rect x={0.5} y={0.5} width={759} height={35} fill="none" stroke="var(--rule)" />
      </svg>
    </div>
  );
}

function Drill({
  cls,
  contributors,
  companies,
}: {
  cls: PoliticalClass;
  contributors: PoliticalContributor[];
  companies: Record<string, { source?: string }>;
}) {
  const rows = contributors.filter((c) => c.cls === cls);
  if (rows.length === 0)
    return (
      <p className="px-4 py-2 text-[12px] text-faint">No named merchants in this class yet.</p>
    );
  // merge by company across categories
  const merged = new Map<string, PoliticalContributor & { categories: string[] }>();
  for (const r of rows) {
    const m = merged.get(r.companyId);
    if (m) {
      m.dollars += r.dollars;
      m.categories.push(r.categoryLabel);
    } else merged.set(r.companyId, { ...r, categories: [r.categoryLabel] });
  }
  return (
    <ul>
      {[...merged.values()]
        .sort((a, b) => b.dollars - a.dollars)
        .map((r) => (
          <li
            key={r.companyId}
            className="flex flex-wrap items-center gap-2.5 border-b border-rule px-4 py-2.5 text-[13px] last:border-b-0"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: CLASSES.find((c) => c.id === cls)!.color }}
              aria-hidden
            />
            <b>{r.name}</b>
            {r.parentName && (
              <span className="text-[12px] text-faint">→ parent: {r.parentName}</span>
            )}
            <span className="text-[11px] text-faint">{r.categories.join(', ')}</span>
            <span className="flex-1" />
            <span className="chip">{fmtMoney(r.dollars)}/mo</span>
            <ProvenanceBadge
              provenance={r.provenance}
              source={companies[r.companyId]?.source}
              showLink={false}
            />
            <a
              className="chip hover:border-ink hover:text-ink"
              href={VERIFY_SOURCES[0].url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify at source ↗
            </a>
          </li>
        ))}
    </ul>
  );
}

/** §8.4 — political exposure, orientation-neutral; Unknown always visible; unconfigured state per §6.4. */
export function PoliticalExposurePanel({
  current,
  target,
  companies,
  printMode = false,
}: {
  current: Exposure;
  target: Exposure;
  companies: Record<string, { source?: string }>;
  printMode?: boolean;
}) {
  const [openCls, setOpenCls] = useState<PoliticalClass>('opposed');
  if (!current.configured) {
    return (
      <div className="mt-4 rounded border border-dashed border-rule px-5 py-8 text-center text-[13px] text-faint">
        <b className="text-ink">Political preference not configured.</b> Compass never guesses your
        politics. Everything is shown as Unknown until you choose which end of the axis is aligned
        with you.
        {!printMode && (
          <div className="mt-3">
            <Link to="/wizard/3" className="btn inline-block">
              Set it up (private, one tap) →
            </Link>
          </div>
        )}
        <Bar label="Current" exposure={current} />
      </div>
    );
  }
  return (
    <div>
      <Bar label="Current" exposure={current} />
      <Bar label="Optimal" exposure={target} />
      <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-2 text-[11.5px] text-faint">
        {CLASSES.map((c) => (
          <span key={c.id} className="inline-flex items-center">
            <span
              className={`mr-[7px] inline-block h-2 w-2 ${c.id === 'unknown' ? 'rounded-sm' : 'rounded-full'}`}
              style={{ background: c.id === 'unknown' ? 'var(--unknown-hatch-fine)' : c.color }}
              aria-hidden
            />
            {c.label}
          </span>
        ))}
      </div>
      {!printMode && (
        <div className="card mt-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2.5 text-[11px] uppercase tracking-[.12em] text-faint">
            <span>Contributing companies · current</span>
            <span className="flex-1" />
            {CLASSES.filter((c) => c.id !== 'unknown').map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenCls(c.id)}
                aria-pressed={openCls === c.id}
                className={`chip ${openCls === c.id ? 'border-ink text-ink' : ''}`}
              >
                {c.label} · {Math.round(current.shares[c.id])}%
              </button>
            ))}
          </div>
          <Drill cls={openCls} contributors={current.contributors} companies={companies} />
        </div>
      )}
      <div className="callout">
        <b className="text-ink">
          {Math.round(current.unassessedShare)}% of spend can't be assessed yet.
        </b>{' '}
        Unknown is never redistributed or hidden — name merchants or adjust buckets in the wizard to
        improve accuracy.
      </div>
    </div>
  );
}
