import type { TrajectoryPoint } from '@/engine/plan';
import { fmt1 } from '@/lib/format';

const W = 760;
const H = 220;
const TOP = 28;
const BOT = 168;
const X0 = 110;
const X1 = 724;

/**
 * §9.3 — projected AlignmentIndex from today through each gate, optimal as a dashed reference.
 * Plain SVG (reference idiom) so it survives Print-to-PDF without a resize observer.
 */
export function Trajectory({ points, target }: { points: TrajectoryPoint[]; target: number }) {
  const vals = points.map((p) => p.index);
  const lo = Math.max(0, Math.floor(Math.min(...vals, target) / 5) * 5 - 3);
  const hi = Math.min(100, Math.ceil(Math.max(...vals, target) / 5) * 5 + 3);
  const span = Math.max(1, hi - lo);
  const y = (v: number) => BOT - ((v - lo) / span) * (BOT - TOP);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? (X0 + X1) / 2 : X0 + (i / (n - 1)) * (X1 - X0));
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.index).toFixed(1)}`)
    .join(' ');
  return (
    <div className="max-[640px]:-mx-5">
      <div className="scrollx max-[640px]:px-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Projected trajectory: ${points.map((p) => `${p.label} ${fmt1(p.index)}`).join(', ')}; optimal ${fmt1(target)}`}
          className="min-w-[600px]"
        >
          {points.map((p, i) => (
            <g key={p.id}>
              <line
                x1={x(i)}
                y1={TOP - 6}
                x2={x(i)}
                y2={BOT + 6}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              <text x={x(i)} y={BOT + 26} fontSize={10.5} textAnchor="middle" fill="var(--faint)">
                {p.label}
              </text>
            </g>
          ))}
          <line
            x1={86}
            x2={748}
            y1={y(target)}
            y2={y(target)}
            stroke="var(--brass)"
            strokeDasharray="4 5"
            strokeWidth={1.4}
          />
          <text x={748} y={y(target) - 6} fontSize={9.5} textAnchor="end" fill="var(--brass)">
            optimal {fmt1(target)}
          </text>
          <path d={d} fill="none" stroke="var(--ink)" strokeWidth={2} />
          {points.map((p, i) => (
            <g key={`p-${p.id}`}>
              <circle
                cx={x(i)}
                cy={y(p.index)}
                r={4.5}
                fill={i === 0 ? 'var(--ink)' : 'var(--paper)'}
                stroke="var(--ink)"
                strokeWidth={2}
              >
                <title>
                  {p.label}: {fmt1(p.index)}
                  {p.topAction ? ` — ${p.topAction}` : ''}
                </title>
              </circle>
              <text
                x={x(i)}
                y={y(p.index) - 12}
                fontSize={11}
                fontWeight={700}
                textAnchor="middle"
                fill="var(--ink)"
              >
                {fmt1(p.index)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
