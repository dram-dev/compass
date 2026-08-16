import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Label,
} from 'recharts';
import type { SwapAction, CostDelta } from '@/engine/types';
import { COST_LABEL, fmt1, fmtMoney } from '@/lib/format';

const COST_X: Record<CostDelta, number> = { saves: 0, neutral: 1, small: 2, moderate: 3 };
const COST_ORDER: CostDelta[] = ['saves', 'neutral', 'small', 'moderate'];

interface Pt {
  id: string;
  x: number;
  y: number;
  z: number;
  label: string;
  desc: string;
  freeWin: boolean;
  cost: CostDelta;
}

/**
 * R7 / §8.6 / EF4 — tradeoff scatter: x = cost delta, y = alignment gain, bubble = $/mo affected,
 * quadrant labels; clicking a bubble scrolls to that action in the plan.
 */
export function ParetoScatter({
  swaps,
  categoryLabels,
}: {
  swaps: SwapAction[];
  categoryLabels: Record<string, string>;
}) {
  const nav = useNavigate();
  const pts = useMemo<Pt[]>(() => {
    const seen: Record<string, number> = {};
    return swaps
      .filter((s) => s.deltaIndexPoints > 0)
      .map((s) => {
        const base = COST_X[s.costDelta];
        const n = (seen[s.costDelta] = (seen[s.costDelta] ?? 0) + 1);
        const jitter = ((n % 5) - 2) * 0.09;
        return {
          id: s.id,
          x: base + jitter,
          y: s.deltaIndexPoints,
          z: s.dollarsPerMonth,
          label: categoryLabels[s.categoryId] ?? s.categoryId,
          desc: s.description,
          freeWin: s.freeWin,
          cost: s.costDelta,
        };
      });
  }, [swaps, categoryLabels]);
  if (pts.length === 0) {
    return (
      <div className="mt-4 rounded border border-dashed border-rule px-5 py-8 text-center text-[13px] text-faint">
        No candidate swaps yet — set targets that differ from your current mix (wizard step 6).
      </div>
    );
  }
  const yMax = Math.max(1, Math.ceil(Math.max(...pts.map((p) => p.y)) * 1.15 * 2) / 2);
  const yMid = yMax / 2;
  return (
    <div
      className="relative mt-2 h-[360px] w-full"
      role="img"
      aria-label="Tradeoff scatter of candidate swaps: cost delta versus alignment gain"
    >
      {/* Quadrant labels — HTML overlays anchored to the plot area (chart margins are fixed). */}
      <span className="pointer-events-none absolute left-[56px] top-[30px] z-10 font-mono text-[9px] font-bold tracking-[.16em] text-brass">
        FREE WINS
      </span>
      <span className="pointer-events-none absolute right-[24px] top-[30px] z-10 font-mono text-[9px] tracking-[.16em] text-faint">
        PAY TO ALIGN
      </span>
      <span className="pointer-events-none absolute bottom-[54px] left-[56px] z-10 font-mono text-[9px] tracking-[.16em] text-faint">
        LOW STAKES
      </span>
      <span className="pointer-events-none absolute bottom-[54px] right-[24px] z-10 font-mono text-[9px] tracking-[.16em] text-faint">
        RECONSIDER
      </span>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 720, height: 300 }}
      >
        <ScatterChart margin={{ top: 28, right: 20, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="0" vertical={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[-0.5, 3.5]}
            ticks={[0, 1, 2, 3]}
            tickFormatter={(v: number) => COST_LABEL[COST_ORDER[v] ?? 'small']}
            tick={{ fill: 'var(--ink)', fontSize: 10.5 }}
            axisLine={{ stroke: 'var(--rule)' }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, yMax]}
            tick={{ fill: 'var(--faint)', fontSize: 9.5 }}
            axisLine={false}
            tickLine={false}
            width={40}
          >
            <Label
              value="Δ index pts"
              angle={-90}
              position="insideLeft"
              style={{ fill: 'var(--faint)', fontSize: 9.5 }}
            />
          </YAxis>
          <ZAxis type="number" dataKey="z" range={[60, 900]} name="$/mo" />
          <ReferenceLine x={1.5} stroke="var(--ink)" strokeDasharray="3 4" strokeOpacity={0.5} />
          <ReferenceLine y={yMid} stroke="var(--ink)" strokeDasharray="3 4" strokeOpacity={0.5} />
          <Tooltip
            cursor={false}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as Pt | undefined;
              if (!p) return null;
              return (
                <div className="max-w-[260px] rounded border border-ink bg-paper px-3 py-2 text-[12px] shadow-lg">
                  <div className="font-semibold">{p.label}</div>
                  <div>{p.desc}</div>
                  <div className="mt-1 font-mono text-faint">
                    +{fmt1(p.y)} pts · {fmtMoney(p.z)}/mo · {COST_LABEL[p.cost]}
                    {p.freeWin ? ' · FREE WIN' : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-brass">Click to open in the plan →</div>
                </div>
              );
            }}
          />
          <Scatter
            data={pts}
            isAnimationActive={false}
            onClick={(d) => nav(`/plan?action=${encodeURIComponent((d as unknown as Pt).id)}`)}
            className="cursor-pointer"
          >
            {pts.map((p) => (
              <Cell
                key={p.id}
                fill={p.freeWin ? 'var(--aligned)' : 'var(--mixed)'}
                fillOpacity={0.45}
                stroke={p.freeWin ? 'var(--aligned)' : 'var(--mixed)'}
                strokeWidth={1.4}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
