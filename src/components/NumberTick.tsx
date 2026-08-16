import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

/** Eased number tick-up on change (600 ms cubic-out); instant under prefers-reduced-motion. */
export function NumberTick({
  value,
  decimals = 1,
  className = '',
  duration = 600,
}: {
  value: number;
  decimals?: number;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = start + (value - start) * e;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, duration]);
  return (
    <span className={`tnum ${className}`} aria-live="polite">
      {shown.toFixed(decimals)}
    </span>
  );
}
