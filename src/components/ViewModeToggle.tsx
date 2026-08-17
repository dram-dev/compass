import { useViewStore, type ViewMode } from '@/store/useViewMode';

const MODES: { id: ViewMode; label: string; title: string }[] = [
  {
    id: 'simple',
    label: 'Simple',
    title: 'Essentials only: spend, where it flows, category gaps, the plan',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    title: 'Everything: political streams, principles radar, tradeoffs, research look-throughs',
  },
];

/** Global display-density switch (header). Purely presentational — it never changes your numbers. */
export function ViewModeToggle({ className = '' }: { className?: string }) {
  const mode = useViewStore((s) => s.viewMode);
  const setMode = useViewStore((s) => s.setViewMode);
  return (
    <div
      role="group"
      aria-label="Display detail"
      className={`inline-flex overflow-hidden rounded-full border border-rule ${className}`}
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.title}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
          className={`px-2.5 py-[3px] font-mono text-[10.5px] uppercase tracking-wide2 ${
            mode === m.id ? 'bg-ink text-paper' : 'text-faint hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Renders children only in detailed mode. */
export function DetailOnly({ children }: { children: React.ReactNode }) {
  const mode = useViewStore((s) => s.viewMode);
  return mode === 'detailed' ? <>{children}</> : null;
}

/**
 * One-line nudge shown in simple mode until the user touches the switch, so nobody concludes the
 * hidden panels don't exist.
 */
export function ViewModeHint({ what }: { what: string }) {
  const mode = useViewStore((s) => s.viewMode);
  const touched = useViewStore((s) => s.viewModeTouched);
  const setMode = useViewStore((s) => s.setViewMode);
  if (mode !== 'simple' || touched) return null;
  return (
    <p className="mt-2 text-[11.5px] text-faint">
      Showing the short version.{' '}
      <button
        type="button"
        className="underline hover:text-ink"
        onClick={() => setMode('detailed')}
      >
        Switch to Detailed
      </button>{' '}
      for {what}.
    </p>
  );
}
