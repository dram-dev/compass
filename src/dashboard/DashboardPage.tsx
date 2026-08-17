import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCompassStore } from '@/store/useCompassStore';
import { useCompanies, useScores } from '@/store/scoring';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { GoalModeToggle } from '@/components/GoalModeToggle';
import { Section } from '@/components/Section';
import { ViewModeHint } from '@/components/ViewModeToggle';
import { useIsDetailed } from '@/store/useViewMode';
import { NumberTick } from '@/components/NumberTick';
import { Dial } from './Dial';
import { Sankey } from './Sankey';
import { SlopeChart } from './SlopeChart';
import { PoliticalExposurePanel } from './PoliticalExposure';
import { PrinciplesRadar } from './PrinciplesRadar';
import { ParetoScatter } from './ParetoScatter';
import { fmt1, fmtMoney, fmtMoneyK, signed1 } from '@/lib/format';

/** §8 — single scrolling dashboard with a sticky goal toggle (R4). */
export function DashboardPage() {
  const scores = useScores();
  const detailed = useIsDetailed();
  const companies = useCompanies();
  const mode = useCompassStore((s) => s.goalMode);
  const categories = useCompassStore((s) => s.categories);
  const principles = useCompassStore((s) => s.principles);
  const holdings = useCompassStore((s) => s.holdings);
  const completed = useCompassStore((s) => s.wizard.completed);
  const total = scores.current.totalSpend;
  const catLabels = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.label])),
    [categories],
  );
  const gain = scores.target.index - scores.current.index;

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-5 border-b border-rule bg-paper/95 px-5 py-2.5 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10.5px] uppercase tracking-wide2 text-faint">
              What do you want to accomplish?
            </div>
            <GoalModeToggle compact className="mt-1" />
          </div>
          <div className="flex items-baseline gap-4 font-mono">
            <span className="text-[11px] uppercase tracking-wide2 text-faint">Index</span>
            <span className="text-[21px]">
              <NumberTick value={scores.current.index} />
            </span>
            <span className="text-[13px] text-brass">→ {fmt1(scores.target.index)}</span>
          </div>
        </div>
      </div>

      {total <= 0 && (
        <div className="callout mt-6">
          <b className="text-ink">Nothing to score yet.</b> The dashboard renders from your wizard
          inputs — add monthly spend in{' '}
          <Link className="underline" to="/wizard/4">
            step 4
          </Link>
          {import.meta.env.DEV ? ' or load the demo persona from the header.' : '.'}
        </div>
      )}
      {total > 0 && !completed && (
        <div className="callout mt-6">
          You haven't finished the wizard yet — the dashboard is live anyway.{' '}
          <Link className="underline" to="/wizard">
            Continue setup →
          </Link>
        </div>
      )}

      <section
        aria-label="Alignment dial"
        className="mt-6 flex flex-wrap items-start gap-x-10 gap-y-2"
      >
        <div className="min-w-[300px] flex-1 basis-[340px] max-[560px]:min-w-0 max-[560px]:basis-full">
          <Dial
            value={scores.current.index}
            band={scores.current.band}
            target={scores.target.index}
          />
        </div>
        <div className="min-w-[270px] flex-1 basis-[300px] pt-2 max-[560px]:min-w-0 max-[560px]:basis-full">
          <div className="flex gap-[26px]">
            <div>
              <div className="eyebrow">Current index</div>
              <div className="font-mono text-[21px]">
                <NumberTick value={scores.current.index} />
              </div>
              <div className="font-mono text-[10.5px] text-faint">
                band {fmt1(scores.current.band[0])}–{fmt1(scores.current.band[1])}
              </div>
            </div>
            <div>
              <div className="eyebrow">Your optimal</div>
              <div className="font-mono text-[21px] text-brass">{fmt1(scores.target.index)}</div>
            </div>
            <div>
              <div className="eyebrow">Gap</div>
              <div
                className={`font-mono text-[21px] ${gain >= 0 ? 'text-aligned' : 'text-opposed'}`}
              >
                {signed1(gain)}
              </div>
            </div>
          </div>
          <p className="mt-3.5 min-h-[64px] font-serif text-[13.5px]">
            {GOAL_MODE_PRESETS[mode].blurb}
          </p>
          <div className="mt-4 flex gap-[26px] border-t border-rule pt-3.5">
            <div>
              <div className="eyebrow">Monthly discretionary</div>
              <div className="font-mono text-[21px]">{fmtMoney(total)}</div>
            </div>
            <div>
              <div className="eyebrow">Portfolio</div>
              <div className="font-mono text-[21px]">
                {holdings.length ? fmtMoneyK(scores.investments.total) : '—'}
              </div>
            </div>
            <div>
              <div className="eyebrow">Categories</div>
              <div className="font-mono text-[21px]">
                {categories.filter((c) => c.monthlySpend > 0).length}
              </div>
            </div>
          </div>
          <div className="mt-4 text-[11.5px] text-faint">
            <span className="text-brass">⌂ </span>All data stays on this device. Export anytime as
            JSON.
            <span className="ml-3 font-mono">re-score {scores.computeMs.toFixed(1)} ms</span>
          </div>
        </div>
      </section>

      {SECTIONS.filter((sec) => detailed || !sec.detailOnly).map((sec, i) => (
        <Section key={sec.key} no={String(i + 1).padStart(2, '0')} title={sec.title} sub={sec.sub}>
          {sec.render({ scores, companies, categories, principles, catLabels })}
        </Section>
      ))}
      <ViewModeHint what="political exposure by profile, principles coverage and the tradeoff scatter" />
    </div>
  );
}

type SectionCtx = {
  scores: ReturnType<typeof useScores>;
  companies: ReturnType<typeof useCompanies>;
  categories: ReturnType<typeof useCompassStore.getState>['categories'];
  principles: ReturnType<typeof useCompassStore.getState>['principles'];
  catLabels: Record<string, string>;
};

/**
 * Dashboard sections in order. `detailOnly` panels are hidden in simple mode (the reviewer feedback
 * was data overload); numbering is derived from what is actually visible, so simple mode reads
 * 01–03 rather than 01, 02, 06.
 */
const SECTIONS: {
  key: string;
  title: string;
  sub: ReactNode;
  detailOnly?: boolean;
  render: (ctx: SectionCtx) => ReactNode;
}[] = [
  {
    key: 'flows',
    title: 'Where the money flows',
    sub: 'Every dollar, traced to its destination — monthly spending or the portfolio itself. Switch the lens, then the state. Hover a flow for dollars, band and named merchants.',
    render: ({ scores, companies, categories }) => (
      <Sankey categories={categories} companies={companies} investments={scores.investments} />
    ),
  },
  {
    key: 'gaps',
    title: 'Category gaps',
    sub: (
      <>
        Alignment index per category, current <span className="font-mono">●</span> to optimal{' '}
        <span className="font-mono text-brass">◆</span>, under the selected goal mode. Sorted by
        distance to close.
      </>
    ),
    render: ({ scores }) => (
      <SlopeChart current={scores.current.categories} target={scores.target.categories} />
    ),
  },
  {
    key: 'political',
    title: 'Political exposure',
    detailOnly: true,
    sub: (
      <>
        Share of spend by political-support profile, <em>relative to your stated preference</em> —
        Compass never assumes a direction, and never hides what it can't assess.
      </>
    ),
    render: ({ scores, companies }) => (
      <PoliticalExposurePanel
        current={scores.political.current}
        target={scores.political.target}
        companies={companies}
      />
    ),
  },
  {
    key: 'principles',
    title: 'Principles coverage',
    detailOnly: true,
    sub: "How well today's spend (and your optimal) serve each weighted principle, 0–100. Unknown portions count as neutral.",
    render: ({ scores, principles }) => (
      <PrinciplesRadar points={scores.radar} principles={principles} />
    ),
  },
  {
    key: 'tradeoffs',
    title: 'Tradeoffs',
    detailOnly: true,
    sub: 'Every recommended swap, plotted: what it gains you against what it costs. Bubble size is dollars affected. Free wins are exactly what they sound like — click one to open it in the plan.',
    render: ({ scores, catLabels }) => (
      <ParetoScatter swaps={scores.swaps} categoryLabels={catLabels} />
    ),
  },
  {
    key: 'plan',
    title: 'The plan',
    sub: "Swaps packed into stage gates by priority within each gate's effort budget, with a projected trajectory.",
    render: ({ scores }) => (
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link to="/plan" className="btn btn-pri">
          Open the plan →
        </Link>
        <span className="font-mono text-[12px] text-faint">
          {scores.plan.swaps.filter((s) => s.gateId).length} actions scheduled · projected{' '}
          {fmt1(scores.plan.finalIndex)} after {scores.plan.gates.length} gates
        </span>
      </div>
    ),
  },
];
