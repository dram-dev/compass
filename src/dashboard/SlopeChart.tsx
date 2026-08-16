import { useMemo } from 'react';
import type { CategoryScore } from '@/engine/score';
import { fmt1 } from '@/lib/format';

const X0 = 196;
const X1 = 664;
const RH = 34;
const TOP = 34;
const sx = (v: number) => X0 + (Math.max(0, Math.min(100, v)) / 100) * (X1 - X0);

/** §8.3 — per-category dumbbells, current ● → target ◆, sorted by gap (custom SVG per reference). */
export function SlopeChart({
  current,
  target,
}: {
  current: CategoryScore[];
  target: CategoryScore[];
}) {
  const rows = useMemo(() => {
    const t = new Map(target.map((c) => [c.categoryId, c]));
    return current
      .filter((c) => c.monthlySpend > 0)
      .map((c) => ({
        id: c.categoryId,
        label: c.label,
        cur: c.index,
        tgt: t.get(c.categoryId)?.index ?? c.index,
      }))
      .sort((a, b) => Math.abs(b.tgt - b.cur) - Math.abs(a.tgt - a.cur));
  }, [current, target]);
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded border border-dashed border-rule px-5 py-10 text-center text-[13px] text-faint">
        Add categories with spend to see per-category gaps.
      </div>
    );
  }
  const H = TOP + rows.length * RH + 6;
  return (
    <div className="mt-4 max-[640px]:-mx-5">
      <div className="scrollx max-[640px]:px-5">
        <svg
          viewBox={`0 0 760 ${H}`}
          role="img"
          aria-label="Category slope chart: current to optimal index per category"
          className="min-w-[660px]"
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={sx(v)}
                y1={TOP - 14}
                x2={sx(v)}
                y2={TOP + rows.length * RH - 6}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              <text x={sx(v)} y={TOP - 20} fontSize={9.5} textAnchor="middle" fill="var(--faint)">
                {v}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = TOP + i * RH + 10;
            const a = sx(r.cur);
            const b = sx(r.tgt);
            return (
              <g key={r.id}>
                <text x={10} y={y + 4} fontSize={11.5} fill="var(--ink)">
                  {r.label.length > 24 ? `${r.label.slice(0, 23)}…` : r.label}
                </text>
                <line
                  x1={Math.min(a, b)}
                  x2={Math.max(a, b)}
                  y1={y}
                  y2={y}
                  stroke={r.tgt >= r.cur ? 'var(--aligned)' : 'var(--opposed)'}
                  strokeOpacity={0.35}
                  strokeWidth={2.5}
                />
                <circle cx={a} cy={y} r={5} fill="var(--ink)">
                  <title>
                    {r.label}: current {fmt1(r.cur)}
                  </title>
                </circle>
                <path d={`M${b} ${y - 6} l6 6 l-6 6 l-6 -6 Z`} fill="var(--brass)">
                  <title>
                    {r.label}: optimal {fmt1(r.tgt)}
                  </title>
                </path>
                <text x={X1 + 8} y={y + 4} fontSize={10} fill="var(--faint)">
                  {fmt1(r.cur)} → {fmt1(r.tgt)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
