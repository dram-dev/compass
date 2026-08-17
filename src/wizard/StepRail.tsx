import { useCompassStore } from '@/store/useCompassStore';
import { useIsDetailed } from '@/store/useViewMode';
import { visibleSteps } from './stepList';

/** Progress rail — every step is revisitable (§7). */
export function StepRail({ step }: { step: number }) {
  const setStep = useCompassStore((s) => s.setWizardStep);
  const detailed = useIsDetailed();
  const steps = visibleSteps(detailed);
  return (
    <nav
      aria-label="Wizard progress"
      className="mt-[18px] flex flex-wrap gap-x-1.5 gap-y-0.5 border-y border-rule py-2.5"
    >
      <ol className="contents">
        {steps.map((s, i) => {
          const done = s.n < step;
          const act = s.n === step;
          const shown = i + 1; // position among visible steps, so simple mode counts 1,2,3
          return (
            <li key={s.n} className="contents">
              <button
                type="button"
                onClick={() => setStep(s.n)}
                aria-current={act ? 'step' : undefined}
                className={`flex items-center gap-[7px] whitespace-nowrap rounded-full border px-[9px] py-1 text-[11px] ${act ? 'border-brass font-semibold text-ink' : 'border-transparent text-faint hover:text-ink'}`}
              >
                <span
                  className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] font-mono text-[10px] ${done ? 'border-aligned bg-aligned text-paper' : act ? 'border-brass font-bold text-brass' : 'border-rule'}`}
                  aria-hidden
                >
                  {done ? '✓' : shown}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
