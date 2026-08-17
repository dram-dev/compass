import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompassStore } from '@/store/useCompassStore';
import { useScores } from '@/store/scoring';
import { StepRail } from './StepRail';
import { clampStep, stepNeighbour, visibleSteps } from './stepList';
import { useIsDetailed } from '@/store/useViewMode';
import { ViewModeHint } from '@/components/ViewModeToggle';
import { Step1Intent } from './steps/Step1Intent';
import { Step2Principles } from './steps/Step2Principles';
import { Step3Political } from './steps/Step3Political';
import { Step4Current } from './steps/Step4Current';
import { Step5Investments } from './steps/Step5Investments';
import { Step6Optimal } from './steps/Step6Optimal';
import { Step7Review } from './steps/Step7Review';
import { NumberTick } from '@/components/NumberTick';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { fmt1 } from '@/lib/format';

const STEP_COMPONENTS = [
  Step1Intent,
  Step2Principles,
  Step3Political,
  Step4Current,
  Step5Investments,
  Step6Optimal,
  Step7Review,
];

/** R1 — 7-step wizard; state persists per keystroke via the store; step persists too (hard refresh safe). */
export function WizardPage() {
  const params = useParams();
  const nav = useNavigate();
  const step = useCompassStore((s) => s.wizard.step);
  const setStep = useCompassStore((s) => s.setWizardStep);
  const mode = useCompassStore((s) => s.goalMode);
  const scores = useScores();
  const detailed = useIsDetailed();
  const steps = visibleSteps(detailed);
  // A density switch can hide the step you are on (simple mode has no step 5) — move to the nearest visible one.
  const shownStep = clampStep(step, detailed);
  useEffect(() => {
    if (shownStep !== step) setStep(shownStep);
  }, [shownStep, step, setStep]);
  const position = steps.findIndex((s) => s.n === shownStep) + 1;
  const prev = stepNeighbour(shownStep, -1, detailed);
  const next = stepNeighbour(shownStep, 1, detailed);

  // Deep link #/wizard/4 → set step once, then normalize the URL.
  useEffect(() => {
    const n = Number(params['*']);
    if (Number.isInteger(n) && n >= 1 && n <= 7) {
      setStep(n);
      nav('/wizard', { replace: true });
    }
  }, [params, setStep, nav]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  const Step = STEP_COMPONENTS[shownStep - 1] ?? Step1Intent;
  const previewIndex = shownStep === 6 ? scores.target.index : scores.current.index;
  const previewLabel = shownStep === 6 ? 'Projected optimal' : 'Alignment index preview';

  return (
    <div className="mx-auto max-w-wiz">
      <div className="mt-6 text-[11px] uppercase tracking-wide2 text-faint">Setup wizard</div>
      <StepRail step={shownStep} />
      <Step />
      <ViewModeHint what="principles weighting, the political lens, investments and a custom optimal" />
      <div
        className="sticky bottom-0 z-10 mt-7 flex flex-wrap items-center gap-4 border-t border-ink bg-paper py-3"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <div className="max-[560px]:order-3 max-[560px]:w-full">
          <div className="eyebrow">{previewLabel}</div>
          <div className="font-mono text-[22px]">
            <NumberTick value={previewIndex} />{' '}
            <small className="text-[11px] text-faint">
              band {fmt1((shownStep === 6 ? scores.target : scores.current).band[0])}–
              {fmt1((shownStep === 6 ? scores.target : scores.current).band[1])} ·{' '}
              {GOAL_MODE_PRESETS[mode].label} weights
            </small>
          </div>
        </div>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-faint">
          STEP {position} / {steps.length}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => prev !== null && setStep(prev)}
          disabled={prev === null}
        >
          Back
        </button>
        {next !== null ? (
          <button type="button" className="btn btn-pri" onClick={() => setStep(next)}>
            Continue →
          </button>
        ) : null}
      </div>
    </div>
  );
}
