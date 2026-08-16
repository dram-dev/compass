import { useId, useRef } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'md' | 'sm';
  className?: string;
}

/** Radiogroup-semantics segmented control (arrow keys move selection). Reference `.seg` styling. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}: SegmentedProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKey = (e: React.KeyboardEvent) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  const pad = size === 'sm' ? 'px-3 py-[7px] text-[11.5px]' : 'px-[13px] py-[9px] text-xs';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      id={id}
      className={`inline-flex flex-wrap overflow-hidden rounded border border-ink ${className}`}
      onKeyDown={onKey}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`${pad} border-r border-ink font-semibold tracking-[.04em] last:border-r-0 focus-visible:-outline-offset-2 max-[480px]:flex-1 ${on ? 'bg-ink text-paper' : 'bg-transparent text-ink hover:bg-card'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
