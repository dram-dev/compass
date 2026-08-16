import { useEffect, useRef, useState } from 'react';
import { fmt1 } from '@/lib/format';
import { prefersReducedMotion } from '@/lib/motion';

const CX = 180;
const CY = 178;
const R = 150;
const ang = (v: number) => ((180 - 1.8 * v) * Math.PI) / 180;
const pt = (v: number, r: number): [number, number] => [
  CX + r * Math.cos(ang(v)),
  CY - r * Math.sin(ang(v)),
];
const f = (n: number) => n.toFixed(1);
const arc = (v1: number, v2: number, r: number) => {
  const a = pt(v1, r);
  const b = pt(v2, r);
  return `M${f(a[0])} ${f(a[1])} A${r} ${r} 0 0 1 ${f(b[0])} ${f(b[1])}`;
};

/**
 * §8.1 — Alignment Index dial (signature element, construction from reference/compass-demo.html):
 * 0–100 arc, ticks, uncertainty band, needle, target tick + diamond, ticking number.
 */
export function Dial({
  value,
  band,
  target,
  className = '',
}: {
  value: number;
  band: [number, number];
  target: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const t1 = pt(clamp(target), R);
  const t2 = pt(clamp(target), 126);
  const d = pt(clamp(target), R + 8);
  const ticks = [];
  for (let v = 0; v <= 100; v += 5) {
    const major = v % 25 === 0;
    const a = pt(v, R);
    const b = pt(v, major ? 132 : 141);
    ticks.push(
      <line
        key={v}
        x1={f(a[0])}
        y1={f(a[1])}
        x2={f(b[0])}
        y2={f(b[1])}
        stroke="var(--ink)"
        strokeWidth={major ? 1.4 : 0.7}
        opacity={major ? 1 : 0.55}
      />,
    );
    if (major) {
      const t = pt(v, 118);
      ticks.push(
        <text
          key={`t${v}`}
          x={f(t[0])}
          y={f(t[1] + 3)}
          fontSize={10}
          textAnchor="middle"
          fill="var(--faint)"
        >
          {v}
        </text>,
      );
    }
  }
  return (
    <svg
      viewBox="0 0 360 232"
      role="img"
      aria-label={`Alignment index dial: ${fmt1(value)} of 100, band ${fmt1(band[0])} to ${fmt1(band[1])}, optimal ${fmt1(target)}`}
      className={`w-full ${className}`}
    >
      <path d={arc(0, 100, R)} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
      {ticks}
      <path
        d={arc(clamp(band[0]), clamp(Math.max(band[1], band[0] + 0.5)), 126)}
        fill="none"
        stroke="var(--aligned)"
        strokeWidth={9}
        strokeOpacity={0.28}
        strokeLinecap="round"
      />
      <path
        d={`M${f(t1[0])} ${f(t1[1])} L${f(t2[0])} ${f(t2[1])}`}
        stroke="var(--brass)"
        strokeWidth={2.5}
        fill="none"
      />
      <path d={`M${f(d[0])} ${f(d[1] - 5)} l5 5 l-5 5 l-5 -5 Z`} fill="var(--brass)" />
      <g
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transformBox: 'view-box',
          transform: `rotate(${clamp(value) * 1.8}deg)`,
          transition: prefersReducedMotion() ? 'none' : 'transform .7s cubic-bezier(.35,1.3,.4,1)',
        }}
      >
        <line x1={CX} y1={CY} x2={CX - 104} y2={CY} stroke="var(--ink)" strokeWidth={2.6} />
        <line x1={CX} y1={CY} x2={CX + 16} y2={CY} stroke="var(--ink)" strokeWidth={2.6} />
        <circle cx={CX} cy={CY} r={5.5} fill="var(--ink)" />
        <circle cx={CX} cy={CY} r={2} fill="var(--paper)" />
      </g>
      <text
        x={CX}
        y={CY + 34}
        fontSize={34}
        textAnchor="middle"
        fontWeight={600}
        fill="var(--ink)"
        className="tnum"
      >
        {fmt1(shown)}
      </text>
      <text
        x={CX}
        y={CY + 52}
        fontSize={8.5}
        letterSpacing=".18em"
        textAnchor="middle"
        fill="var(--faint)"
      >
        ALIGNMENT INDEX · 0–100
      </text>
    </svg>
  );
}
