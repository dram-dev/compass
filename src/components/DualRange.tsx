import { useCallback, useEffect, useRef, useState } from 'react';

export interface DualRangeProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  /** CSS color for the fill; pass a hatch class instead via `hatch` for the Unknown bucket. */
  color?: string;
  hatch?: boolean;
  label: string; // used for ARIA labels: "<label> minimum share" / "maximum share"
  min?: number;
  max?: number;
  minGap?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Dual-thumb range slider — Pointer Events implementation ported from reference/compass-wizard.html.
 * Pointer capture on the host, `touch-action: none`, nearest-thumb pick, keyboard + ARIA slider
 * semantics per thumb. Paired native <input type=range> is deliberately NOT used (spec §4).
 */
export function DualRange({
  value,
  onChange,
  color = 'var(--ink)',
  hatch = false,
  label,
  min = 0,
  max = 100,
  minGap = 2,
  disabled = false,
  className = '',
}: DualRangeProps) {
  const host = useRef<HTMLDivElement>(null);
  const thumbs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)] as const;
  const [drag, setDrag] = useState<-1 | 0 | 1>(-1);
  const latest = useRef(value);
  latest.current = value;

  const clampThumb = useCallback(
    (i: 0 | 1, raw: number, cur: [number, number]): number => {
      let v = Math.max(min, Math.min(max, Math.round(raw)));
      if (i === 0) v = Math.min(v, cur[1] - minGap);
      else v = Math.max(v, cur[0] + minGap);
      return Math.max(min, Math.min(max, v));
    },
    [min, max, minGap],
  );

  const setThumb = useCallback(
    (i: 0 | 1, raw: number) => {
      const cur = latest.current;
      const v = clampThumb(i, raw, cur);
      const next: [number, number] = i === 0 ? [v, cur[1]] : [cur[0], v];
      if (next[0] !== cur[0] || next[1] !== cur[1]) onChange(next);
    },
    [clampThumb, onChange],
  );

  const pct = useCallback(
    (clientX: number) => {
      const r = host.current!.getBoundingClientRect();
      if (r.width <= 0) return min;
      return min + ((clientX - r.left) / r.width) * (max - min);
    },
    [min, max],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const p = pct(e.clientX);
    const cur = latest.current;
    const i: 0 | 1 = Math.abs(p - cur[0]) <= Math.abs(p - cur[1]) ? 0 : 1;
    setDrag(i);
    setThumb(i, p);
    host.current?.setPointerCapture?.(e.pointerId);
    try {
      thumbs[i].current?.focus({ preventScroll: true });
    } catch {
      thumbs[i].current?.focus();
    }
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag < 0 || disabled) return;
    setThumb(drag as 0 | 1, pct(e.clientX));
  };
  const endDrag = () => setDrag(-1);

  useEffect(() => {
    if (drag < 0) return;
    const up = () => setDrag(-1);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag]);

  const onKey = (i: 0 | 1) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const cur = latest.current;
    let d = 0;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        d = -1;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        d = 1;
        break;
      case 'PageDown':
        d = -10;
        break;
      case 'PageUp':
        d = 10;
        break;
      case 'Home':
        setThumb(i, min);
        e.preventDefault();
        return;
      case 'End':
        setThumb(i, max);
        e.preventDefault();
        return;
      default:
        return;
    }
    setThumb(i, cur[i] + d);
    e.preventDefault();
  };

  const span = max - min || 1;
  const left = ((value[0] - min) / span) * 100;
  const right = ((value[1] - min) / span) * 100;

  return (
    <div
      ref={host}
      className={`relative h-[34px] touch-none select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-testid="dual-range"
    >
      <div className="absolute left-0 right-0 top-[15px] h-1 rounded-sm bg-rule" aria-hidden />
      <div
        className={`absolute top-[15px] h-1 rounded-sm ${hatch ? 'hatch' : ''}`}
        style={{
          left: `${left}%`,
          width: `${Math.max(0, right - left)}%`,
          background: hatch ? undefined : color,
        }}
        aria-hidden
      />
      {([0, 1] as const).map((i) => (
        <div
          key={i}
          ref={thumbs[i]}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${label} ${i === 0 ? 'minimum' : 'maximum'} share`}
          aria-valuemin={i === 0 ? min : value[0] + minGap}
          aria-valuemax={i === 0 ? value[1] - minGap : max}
          aria-valuenow={value[i]}
          aria-valuetext={`${value[i]}%`}
          aria-disabled={disabled || undefined}
          onKeyDown={onKey(i)}
          className="absolute top-1/2 h-[22px] w-[22px] cursor-grab rounded-full border-[2.5px] border-ink bg-paper active:cursor-grabbing"
          style={{
            left: `${i === 0 ? left : right}%`,
            margin: '-11px 0 0 -11px',
            touchAction: 'none',
          }}
        />
      ))}
    </div>
  );
}
