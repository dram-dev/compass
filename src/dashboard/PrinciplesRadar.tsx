import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { RadarPoint } from '@/engine/radar';
import type { Principle } from '@/engine/types';

/** §8.5 — principle coverage radar, current vs optimal (Recharts). */
export function PrinciplesRadar({
  points,
  principles,
}: {
  points: RadarPoint[];
  principles: Principle[];
}) {
  const labels = new Map(principles.map((p) => [p.id, p.label]));
  const data = points
    .filter((p) => (principles.find((x) => x.id === p.principleId)?.weight ?? 0) > 0)
    .map((p) => ({
      name: labels.get(p.principleId) ?? p.principleId,
      current: Math.round(p.current),
      optimal: Math.round(p.target),
    }));
  if (data.length < 3) {
    return (
      <div className="mt-4 rounded border border-dashed border-rule px-5 py-8 text-center text-[13px] text-faint">
        Weight at least three principles (wizard step 2) to draw the radar.
      </div>
    );
  }
  return (
    <div
      className="mt-2 h-[340px] w-full"
      role="img"
      aria-label={`Principles radar: ${data.map((d) => `${d.name} ${d.current} now, ${d.optimal} optimal`).join('; ')}`}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 720, height: 300 }}
      >
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--rule)" />
          <PolarAngleAxis dataKey="name" tick={{ fill: 'var(--ink)', fontSize: 11 }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: 'var(--faint)', fontSize: 9 }}
            axisLine={false}
          />
          <Radar
            name="Current"
            dataKey="current"
            stroke="var(--ink)"
            fill="var(--ink)"
            fillOpacity={0.12}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Radar
            name="Optimal"
            dataKey="optimal"
            stroke="var(--brass)"
            fill="var(--brass)"
            fillOpacity={0.15}
            strokeWidth={2}
            strokeDasharray="4 3"
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--paper)',
              border: '1px solid var(--ink)',
              fontSize: 12,
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11.5, color: 'var(--faint)' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
