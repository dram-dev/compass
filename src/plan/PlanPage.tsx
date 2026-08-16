import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCompassStore } from '@/store/useCompassStore';
import { useCompanies, useScores } from '@/store/scoring';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { VERIFY_SOURCES } from '@/data/verifySources';
import { GateConfigPanel } from './GateConfig';
import { ActionCard } from './ActionCard';
import { Trajectory } from './Trajectory';
import { PoliticalExposurePanel } from '@/dashboard/PoliticalExposure';
import { InvestmentsDisclaimer, MultiplierNote } from '@/components/Disclaimers';
import { fmt1, fmtMoney, signed1 } from '@/lib/format';
import './print.css';

/**
 * R6 / R9 / §9 — the plan: gate configuration, greedy-filled stage gates with drag/dismiss,
 * projected trajectory, political before/after, provenance footnote. The same route is the
 * print document (print.css hides controls; sections avoid page breaks).
 */
export function PlanPage() {
  const scores = useScores();
  const companies = useCompanies();
  const s = useCompassStore();
  const [params, setParams] = useSearchParams();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const highlight = params.get('action');
  const catLabels = useMemo(
    () => Object.fromEntries(s.categories.map((c) => [c.id, c.label])),
    [s.categories],
  );
  const swapsById = useMemo(
    () => new Map(scores.plan.swaps.map((x) => [x.id, x])),
    [scores.plan.swaps],
  );
  const dismissedSwaps = useMemo(
    () => scores.swaps.filter((x) => s.dismissed.includes(x.id)),
    [scores.swaps, s.dismissed],
  );
  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    [],
  );

  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`action-${highlight}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setParams({}, { replace: true }), 3500);
      return () => clearTimeout(t);
    }
  }, [highlight, setParams]);

  const onDrop = (gateId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragOver(null);
    if (id && swapsById.has(id)) s.placeAction(id, gateId);
  };
  const gain = scores.target.index - scores.current.index;
  const total = scores.current.totalSpend;

  return (
    <div className="plan-doc">
      {/* ---- cover block ---- */}
      <section className="plan-cover mt-8 border-b border-ink pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide2 text-faint">
              Alignment action plan
            </div>
            <h1 className="mt-1 text-[32px] leading-tight">
              {s.profile.name ? `${s.profile.name}'s plan` : 'Your plan'}
            </h1>
            <p className="mt-2 max-w-[60ch] font-serif text-[14px] text-faint">
              {today} · {GOAL_MODE_PRESETS[s.goalMode].label} · {fmtMoney(total)}/mo discretionary
              across {s.categories.filter((c) => c.monthlySpend > 0).length} categories
            </p>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="eyebrow">Index now</div>
              <div className="font-mono text-[28px]">{fmt1(scores.current.index)}</div>
            </div>
            <div>
              <div className="eyebrow">After plan</div>
              <div className="font-mono text-[28px] text-aligned">
                {fmt1(scores.plan.finalIndex)}
              </div>
            </div>
            <div>
              <div className="eyebrow">Your optimal</div>
              <div className="font-mono text-[28px] text-brass">{fmt1(scores.target.index)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
          <button type="button" className="btn btn-pri" onClick={() => window.print()}>
            Print / save as PDF
          </button>
          <Link to="/dashboard" className="btn">
            ← Dashboard
          </Link>
          <span className="font-mono text-[12px] text-faint">
            {scores.plan.swaps.filter((x) => x.gateId).length} scheduled ·{' '}
            {scores.plan.unscheduled.length} unscheduled · {dismissedSwaps.length} dismissed · gain{' '}
            {signed1(gain)} available
          </span>
        </div>
        <GateConfigPanel />
      </section>

      {total <= 0 && (
        <div className="callout mt-6">
          Nothing to plan yet — add monthly spend and targets in the{' '}
          <Link className="underline" to="/wizard">
            wizard
          </Link>
          .
        </div>
      )}

      {/* ---- trajectory ---- */}
      <section className="plan-section mt-8">
        <div className="flex items-baseline gap-3.5 border-t border-rule pt-3.5">
          <span className="sec-no">01</span>
          <h2 className="text-[21px]">Projected trajectory</h2>
        </div>
        <p className="sub">
          Alignment Index from today through each gate, assuming every scheduled action lands. The
          dashed line is your optimal.
        </p>
        <div className="mt-2">
          <Trajectory points={scores.trajectory} target={scores.target.index} />
        </div>
        <ol className="mt-1 grid gap-1 text-[12px] text-faint sm:grid-cols-3">
          {scores.trajectory.slice(1).map((p) => (
            <li key={p.id}>
              <b className="text-ink">{p.label}</b> · {fmt1(p.index)}
              {p.topAction && <span> — {p.topAction}</span>}
            </li>
          ))}
        </ol>
      </section>

      {/* ---- gates ---- */}
      <section className="plan-section mt-8">
        <div className="flex items-baseline gap-3.5 border-t border-rule pt-3.5">
          <span className="sec-no">02</span>
          <h2 className="text-[21px]">Stage gates</h2>
        </div>
        <p className="sub">
          Actions are packed by priority (impact ÷ effort) within each gate's effort budget, free
          wins first. Drag a card between gates or use "Move to"; projections recompute on drop.
        </p>
        <div
          className="plan-gates mt-5 grid gap-3.5"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(${scores.plan.gates.length > 3 ? 220 : 250}px, 1fr))`,
          }}
        >
          {scores.plan.gates.map((g) => {
            const over = (g.effortUsed ?? 0) > g.effortBudget;
            return (
              <div
                key={g.id}
                className={`plan-gate card flex flex-col ${dragOver === g.id ? 'ring-2 ring-brass' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOver !== g.id) setDragOver(g.id);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={onDrop(g.id)}
                aria-label={`Gate ${g.label}`}
                data-testid="gate-column"
              >
                <div className="border-b border-rule px-4 pb-2.5 pt-3.5">
                  <div className="font-serif text-[19px] font-semibold">{g.label}</div>
                  <div
                    className={`mt-0.5 font-mono text-[11px] ${over ? 'text-opposed' : 'text-faint'}`}
                  >
                    effort {g.effortUsed ?? 0} / {g.effortBudget} budget
                    {over ? ' · over budget' : ''}
                  </div>
                  <div className="mt-0.5 font-mono text-[12px]">
                    projected index <b className="text-aligned">{fmt1(g.projectedIndex)}</b>
                  </div>
                </div>
                {g.actions.length === 0 && (
                  <div className="px-4 py-6 text-center text-[12px] text-faint">
                    Nothing scheduled — drop an action here.
                  </div>
                )}
                {g.actions.map((id) => {
                  const a = swapsById.get(id);
                  if (!a) return null;
                  return (
                    <ActionCard
                      key={id}
                      action={a}
                      categoryLabel={catLabels[a.categoryId] ?? a.categoryId}
                      gates={scores.plan.gates}
                      highlighted={highlight === id}
                      isManual={!!s.placements[id]}
                      onMove={(gid) => s.placeAction(id, gid)}
                      onDismiss={() => s.dismissAction(id)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        {scores.plan.swaps.some((x) => x.localShift) && <MultiplierNote className="mt-3" />}
        {scores.plan.unscheduled.length > 0 && (
          <div className="card mt-4 print:hidden">
            <div className="border-b border-rule px-4 py-2.5 text-[11px] uppercase tracking-[.12em] text-faint">
              Didn't fit any gate's budget — raise a budget, add a gate, or move manually
            </div>
            {scores.plan.unscheduled.map((a) => (
              <ActionCard
                key={a.id}
                action={a}
                categoryLabel={catLabels[a.categoryId] ?? a.categoryId}
                gates={scores.plan.gates}
                highlighted={highlight === a.id}
                onMove={(gid) => s.placeAction(a.id, gid)}
                onDismiss={() => s.dismissAction(a.id)}
              />
            ))}
          </div>
        )}
        {dismissedSwaps.length > 0 && (
          <details className="mt-4 print:hidden">
            <summary className="cursor-pointer text-[12px] text-faint hover:text-ink">
              {dismissedSwaps.length} dismissed action{dismissedSwaps.length > 1 ? 's' : ''}{' '}
              (remembered — restore anytime)
            </summary>
            <ul className="mt-2 grid gap-1 text-[12.5px]">
              {dismissedSwaps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-faint">{a.description}</span>
                  <button
                    type="button"
                    className="chip hover:border-ink hover:text-ink"
                    onClick={() => s.restoreAction(a.id)}
                  >
                    restore
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ---- political before / after ---- */}
      <section className="plan-section plan-page-break mt-8">
        <div className="flex items-baseline gap-3.5 border-t border-rule pt-3.5">
          <span className="sec-no">03</span>
          <h2 className="text-[21px]">Political exposure — before and after</h2>
        </div>
        <p className="sub">
          Share of spend by political-support profile relative to your stated preference. Unknown is
          never hidden or redistributed.
        </p>
        <PoliticalExposurePanel
          current={scores.political.current}
          target={scores.political.target}
          companies={companies}
          printMode
        />
      </section>

      {/* ---- investments (only if any) ---- */}
      {scores.investments.recommendations.length > 0 && (
        <section className="plan-section mt-8">
          <div className="flex items-baseline gap-3.5 border-t border-rule pt-3.5">
            <span className="sec-no">04</span>
            <h2 className="text-[21px]">Investment scenarios — by vehicle class</h2>
          </div>
          <InvestmentsDisclaimer className="!mt-3" />
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-[13px]">
            {scores.investments.recommendations.map((r) => (
              <li
                key={r.holding.id}
                className="grid grid-cols-[1fr_auto] gap-3 py-2.5 max-[560px]:grid-cols-1"
              >
                <div>
                  <b>{r.holding.label}</b>{' '}
                  <span className="text-faint">· {fmtMoney(r.holding.amount)}</span>
                  <div className="text-[12.5px] text-faint">{r.suggestion}</div>
                </div>
                <div className="font-mono text-[11.5px] text-faint">
                  {r.currentBucket} → {r.targetBucket}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- provenance footnote ---- */}
      <section className="plan-section mt-8 border-t border-rule pt-4 text-[11.5px] text-faint">
        <b className="text-ink">About the data.</b> Alignment scores use your own principle weights
        and bucket ratings; company-level ratings and political leans marked{' '}
        <span className="chip">Sample — verify</span> are illustrative placeholders (fictional
        archetypes only), your own edits are marked{' '}
        <span className="chip border-dashed border-ink text-ink">Yours</span>, and community packs
        are marked <span className="chip border-brass text-brass">Imported</span>. Verify before
        acting:{' '}
        {VERIFY_SOURCES.map((v, i) => (
          <span key={v.id}>
            {i > 0 && ' · '}
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline-offset-2 hover:underline"
            >
              {v.label}
            </a>
          </span>
        ))}
        . Effort ratings: 1 = habit tweak … 5 = project. Educational scenario tool — not financial,
        investment, or tax advice. Company political data varies by source and time.
      </section>
    </div>
  );
}
