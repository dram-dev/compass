import { useMemo, useState } from 'react';
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import {
  BUCKET_IDS,
  BUCKET_LABELS,
  type BucketId,
  type Company,
  type InvestmentBucketId,
  type SpendCategory,
} from '@/engine/types';
import {
  INVESTMENT_BUCKET_LABELS,
  INVESTMENT_BUCKETS,
  type InvestmentsSummary,
} from '@/engine/investments';
import { midpoints } from '@/engine/allocation';
import { Segmented } from '@/components/Segmented';
import { InvestmentsDisclaimer } from '@/components/Disclaimers';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { BUCKET_COLOR } from '@/lib/bucketColors';
import { fmtMoney, fmtMoneyK } from '@/lib/format';
import { prefersReducedMotion } from '@/lib/motion';

type Lens = 'spend' | 'invest';
type Mode = 'cur' | 'opt';

interface NodeDatum {
  id: string;
  label: string;
  amount: number;
  side: 'left' | 'right';
  color: string;
  hatch?: boolean;
}
interface LinkDatum {
  source: string;
  target: string;
  value: number;
  color: string;
  hatch?: boolean;
  meta: LinkMeta;
}
interface LinkMeta {
  leftLabel: string;
  rightLabel: string;
  dollars: number;
  band?: [number, number];
  mid?: number;
  named: Company[];
}

type SNode = SankeyNode<NodeDatum, LinkDatum>;
type SLink = SankeyLink<NodeDatum, LinkDatum>;

const W = 760;
const H = 470;
const INV_COLOR: Record<InvestmentBucketId, string> = {
  'community-aligned': 'var(--aligned)',
  'broad-mixed': 'var(--mixed)',
  'major-concentrated': 'var(--opposed)',
  'unknown-unrated': 'var(--unknown)',
};

function spendGraph(
  categories: readonly SpendCategory[],
  which: 'current' | 'target',
  companies: Record<string, Company>,
) {
  const nodes: NodeDatum[] = [];
  const links: LinkDatum[] = [];
  const totals: Record<BucketId, number> = { local: 0, regional: 0, major: 0, unknown: 0 };
  for (const c of categories) {
    if (!(c.monthlySpend > 0)) continue;
    nodes.push({
      id: `c:${c.id}`,
      label: c.label,
      amount: c.monthlySpend,
      side: 'left',
      color: 'var(--ink)',
    });
    const shares = midpoints(c[which]);
    for (const b of BUCKET_IDS) {
      const d = (shares[b] / 100) * c.monthlySpend;
      totals[b] += d;
      if (d <= 0.01) continue;
      const alloc = c[which].find((a) => a.bucket === b);
      const named = (alloc?.namedCompanyIds ?? [])
        .map((id) => companies[id])
        .filter((x): x is Company => !!x);
      const [lo, hi] = alloc?.rangePct ?? [0, 0];
      links.push({
        source: `c:${c.id}`,
        target: `b:${b}`,
        value: d,
        color: BUCKET_COLOR[b],
        hatch: b === 'unknown',
        meta: {
          leftLabel: c.label,
          rightLabel: BUCKET_LABELS[b],
          dollars: d,
          band: [lo, hi],
          mid: shares[b],
          named,
        },
      });
    }
  }
  for (const b of BUCKET_IDS)
    nodes.push({
      id: `b:${b}`,
      label: BUCKET_LABELS[b],
      amount: totals[b],
      side: 'right',
      color: BUCKET_COLOR[b],
      hatch: b === 'unknown',
    });
  return { nodes, links, total: Object.values(totals).reduce((s, x) => s + x, 0), fmt: fmtMoney };
}

function investGraph(inv: InvestmentsSummary, which: 'current' | 'target') {
  const nodes: NodeDatum[] = [];
  const links: LinkDatum[] = [];
  const totals: Record<InvestmentBucketId, number> = {
    'community-aligned': 0,
    'broad-mixed': 0,
    'major-concentrated': 0,
    'unknown-unrated': 0,
  };
  for (const s of inv.sleeves) {
    nodes.push({
      id: `s:${s.sleeve}`,
      label: s.label,
      amount: s.amount,
      side: 'left',
      color: 'var(--ink)',
    });
    for (const b of INVESTMENT_BUCKETS) {
      const d = s[which][b];
      totals[b] += d;
      if (d <= 0.01) continue;
      links.push({
        source: `s:${s.sleeve}`,
        target: `i:${b}`,
        value: d,
        color: INV_COLOR[b],
        hatch: b === 'unknown-unrated',
        meta: {
          leftLabel: s.label,
          rightLabel: INVESTMENT_BUCKET_LABELS[b],
          dollars: d,
          named: [],
        },
      });
    }
  }
  for (const b of INVESTMENT_BUCKETS)
    nodes.push({
      id: `i:${b}`,
      label: INVESTMENT_BUCKET_LABELS[b],
      amount: totals[b],
      side: 'right',
      color: INV_COLOR[b],
      hatch: b === 'unknown-unrated',
    });
  return { nodes, links, total: inv.total, fmt: fmtMoneyK };
}

function layout(graph: ReturnType<typeof spendGraph>) {
  if (graph.links.length === 0) return null;
  const gen = sankey<NodeDatum, LinkDatum>()
    .nodeId((d) => d.id)
    .nodeWidth(12)
    .nodePadding(14)
    .nodeSort(null)
    .linkSort(null)
    .extent([
      [176, 14],
      [590 + 12, H - 14],
    ]);
  const g = gen({
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.links.map((l) => ({ ...l })),
  });
  return { ...g, total: graph.total, fmt: graph.fmt };
}

const LEGEND_SPEND = BUCKET_IDS.map((b) => ({
  label: BUCKET_LABELS[b],
  color: BUCKET_COLOR[b],
  hatch: b === 'unknown',
}));
const LEGEND_INVEST = INVESTMENT_BUCKETS.map((b) => ({
  label: INVESTMENT_BUCKET_LABELS[b],
  color: INV_COLOR[b],
  hatch: b === 'unknown-unrated',
}));

/**
 * R5 / §8.2 — Sankey with two controls: asset lens (Spending / Investments) × state (Current /
 * Optimal), 300 ms crossfade. Thin d3-sankey wrapper; all four layouts are rendered and faded.
 */
export function Sankey({
  categories,
  companies,
  investments,
}: {
  categories: readonly SpendCategory[];
  companies: Record<string, Company>;
  investments: InvestmentsSummary;
}) {
  const [lens, setLens] = useState<Lens>('spend');
  const [mode, setMode] = useState<Mode>('cur');
  const [hover, setHover] = useState<{ meta: LinkMeta; x: number; y: number } | null>(null);
  const layouts = useMemo(
    () => ({
      'spend-cur': layout(spendGraph(categories, 'current', companies)),
      'spend-opt': layout(spendGraph(categories, 'target', companies)),
      'invest-cur': layout(investGraph(investments, 'current')),
      'invest-opt': layout(investGraph(investments, 'target')),
    }),
    [categories, companies, investments],
  );
  const activeKey = `${lens}-${mode}` as keyof typeof layouts;
  const active = layouts[activeKey];
  const fade = prefersReducedMotion() ? 'none' : 'opacity .3s ease';
  const legend = lens === 'spend' ? LEGEND_SPEND : LEGEND_INVEST;

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 print:hidden">
        <Segmented<Lens>
          options={[
            { value: 'spend', label: 'Spending' },
            { value: 'invest', label: 'Investments' },
          ]}
          value={lens}
          onChange={setLens}
          ariaLabel="Asset lens"
          size="sm"
        />
        <Segmented<Mode>
          options={[
            { value: 'cur', label: 'Current' },
            { value: 'opt', label: 'Optimal' },
          ]}
          value={mode}
          onChange={setMode}
          ariaLabel="Flow state"
          size="sm"
        />
      </div>
      <div className="relative mt-4 max-[640px]:-mx-5">
        <div className="scrollx max-[640px]:px-5">
          {active ? (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${lens === 'spend' ? 'Spending' : 'Investments'} flow, ${mode === 'cur' ? 'current' : 'optimal'}`}
              className="min-w-[660px]"
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <pattern
                  id="sk-hatch"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="8" height="8" fill="var(--unknown)" />
                  <rect width="4" height="8" fill="#b8bdb0" />
                </pattern>
              </defs>
              {(Object.keys(layouts) as (keyof typeof layouts)[]).map((k) => {
                const g = layouts[k];
                if (!g) return null;
                const on = k === activeKey;
                return (
                  <g
                    key={k}
                    opacity={on ? 1 : 0}
                    style={{ transition: fade, pointerEvents: on ? 'auto' : 'none' }}
                    aria-hidden={!on}
                  >
                    {(g.links as SLink[]).map((l, i) => (
                      <path
                        key={i}
                        d={sankeyLinkHorizontal()(l) ?? undefined}
                        fill="none"
                        stroke={l.hatch ? 'url(#sk-hatch)' : l.color}
                        strokeOpacity={l.hatch ? 0.5 : 0.42}
                        strokeWidth={Math.max(1, l.width ?? 1)}
                        onMouseMove={(e) => {
                          const r = (
                            e.currentTarget.ownerSVGElement as SVGSVGElement
                          ).getBoundingClientRect();
                          setHover({ meta: l.meta, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        className="cursor-help hover:stroke-opacity-70"
                      >
                        <title>
                          {l.meta.leftLabel} → {l.meta.rightLabel}: {g.fmt(l.meta.dollars)}
                        </title>
                      </path>
                    ))}
                    {(g.nodes as SNode[]).map((n) => {
                      const x0 = n.x0 ?? 0;
                      const y0 = n.y0 ?? 0;
                      const h = (n.y1 ?? 0) - y0;
                      const mid = y0 + h / 2;
                      return (
                        <g key={n.id}>
                          <rect
                            x={x0}
                            y={y0}
                            width={12}
                            height={Math.max(0.5, h)}
                            fill={n.hatch ? 'url(#sk-hatch)' : n.color}
                          />
                          {n.side === 'left' ? (
                            <>
                              <text
                                x={x0 - 10}
                                y={mid + 1}
                                fontSize={11}
                                textAnchor="end"
                                fill="var(--ink)"
                              >
                                {n.label}
                              </text>
                              <text
                                x={x0 - 10}
                                y={mid + 13}
                                fontSize={9.5}
                                textAnchor="end"
                                fill="var(--faint)"
                              >
                                {g.fmt(n.amount)}
                              </text>
                            </>
                          ) : (
                            <>
                              <text x={x0 + 22} y={mid + 1} fontSize={11} fill="var(--ink)">
                                {n.label}
                              </text>
                              <text x={x0 + 22} y={mid + 13} fontSize={9.5} fill="var(--faint)">
                                {g.fmt(n.amount)} ·{' '}
                                {g.total > 0 ? Math.round((n.amount / g.total) * 100) : 0}%
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="rounded border border-dashed border-rule px-5 py-10 text-center text-[13px] text-faint">
              {lens === 'spend'
                ? 'No spending yet — add monthly totals in the wizard (step 4) to see where the money flows.'
                : 'No holdings yet — add them in the wizard (step 5) to see the investments lens.'}
            </div>
          )}
        </div>
        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 max-w-[280px] rounded border border-ink bg-paper px-3 py-2 text-[12px] shadow-lg"
            style={{ left: Math.min(hover.x + 12, 480), top: hover.y + 12 }}
          >
            <div className="font-semibold">
              {hover.meta.leftLabel} → {hover.meta.rightLabel}
            </div>
            <div className="font-mono text-faint">
              {(active?.fmt ?? fmtMoney)(hover.meta.dollars)}
              {lens === 'spend' ? '/mo' : ''}
              {hover.meta.band &&
                ` · band ${hover.meta.band[0]}–${hover.meta.band[1]}% · mid ${hover.meta.mid?.toFixed(1)}%`}
            </div>
            {hover.meta.named.length > 0 && (
              <ul className="mt-1.5 grid gap-1">
                {hover.meta.named.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                    <span>{c.name}</span>
                    {c.parentCompanyId && companies[c.parentCompanyId] && (
                      <span className="text-faint">→ {companies[c.parentCompanyId]!.name}</span>
                    )}
                    <ProvenanceBadge
                      provenance={c.ratingsProvenance}
                      source={c.source}
                      showLink={false}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div
        className="mt-3 flex flex-wrap gap-x-[18px] gap-y-2 text-[11.5px] text-faint"
        aria-label="Legend"
      >
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center">
            <span
              className={`mr-[7px] inline-block h-2 w-2 ${l.hatch ? 'rounded-sm' : 'rounded-full'}`}
              style={{ background: l.hatch ? 'var(--unknown-hatch-fine)' : l.color }}
              aria-hidden
            />
            {l.label}
          </span>
        ))}
      </div>
      {lens === 'invest' && <InvestmentsDisclaimer className="!mt-3.5" />}
    </div>
  );
}
