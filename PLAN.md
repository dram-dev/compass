# Compass — build plan

Spec: `docs/BUILD-PROMPT.md`. Reference demos: `reference/`. Judgment calls: `ASSUMPTIONS.md`.

## Phase gates (§13)

| Phase | Scope | Gate | Commit |
|---|---|---|---|
| P0 | Vite + React 18 + TS strict + Tailwind + Zustand + Vitest + ESLint/Prettier; routes; design tokens; app shell | dev server up; `build`/`lint`/`test` clean; PLAN.md + ASSUMPTIONS.md | `P0: scaffold` |
| P1 | Types (§5), engine (§6), bucket defaults, heuristics, sample dataset, principle library, Jordan fixture | §6.5 exact; Jordan 42.0/58.9/+5.2; engine coverage ≥ 90% | `P1: engine + data` |
| P2 | Wizard steps 1–7, dual-range control, per-keystroke persistence, migrations | Jordan walkthrough; hard-refresh restores at any step | `P2: wizard` |
| P3 | Dashboard: dial, sankey (lens × state), slope, political, radar, pareto, sticky goal toggle | re-score < 100 ms; zero/partial-data states | `P3: dashboard` |
| P4 | Plan: gates config, generator, drag/dismiss, trajectory, `/plan` print view | Print-to-PDF clean; reallocation unit test | `P4: plan` |
| P5 | Empty/error states, a11y pass, export/import, data-pack schema doc, README traceability | §14 checklist green ✅ (all gates P0–P5 committed) | `P5: polish` |

## Traceability — hard requirements

| ID | Requirement | Implementation | Phase |
|---|---|---|---|
| R1 | Wizard | `src/wizard/Wizard.tsx`, `steps/Step1Intent…Step7Review.tsx`, `StepRail.tsx` | P2 |
| R2 | Current mix with dual-thumb ranges | `src/components/DualRange.tsx` (Pointer Events), `src/wizard/CategoryCard.tsx`, `src/wizard/steps/Step4Current.tsx`; engine midpoints in `src/engine/allocation.ts` | P1/P2 |
| R3 | Company + political mapping | `src/engine/political.ts`, `src/dashboard/PoliticalExposure.tsx` (drill-down w/ parent roll-up, provenance, verify link), sankey link tooltips | P1/P3 |
| R4 | Goal toggle | `src/components/GoalModeToggle.tsx` used in `Step1Intent` + sticky `src/dashboard/DashboardHeader.tsx`; `store/useCompassStore.setGoalMode` re-weights principles + rescoring selectors | P2/P3 |
| R5 | Sankey (lens × state) + slope | `src/dashboard/Sankey.tsx` (d3-sankey wrapper), `src/dashboard/SlopeChart.tsx` | P3 |
| R6 | Stage-gate plan w/ impact/effort/cost + trajectory | `src/engine/plan.ts`, `src/plan/GateBoard.tsx`, `src/plan/ActionCard.tsx`, `src/plan/Trajectory.tsx`, `src/plan/GateConfig.tsx` | P4 |
| R7 | Tradeoff visuals | `src/dashboard/ParetoScatter.tsx` + badges in `ActionCard.tsx` | P3/P4 |
| R8 | User-defined optimal | `src/wizard/steps/Step6Optimal.tsx` (prefill from `src/data/goalModePresets.ts`, fully editable), principle weights (`Step2Principles`), company rating overrides (`src/components/CompanyRatingEditor.tsx`), bucket defaults Advanced panel | P2 |
| R9 | Printable plan | `src/plan/PlanPrintView.tsx` at `#/plan`, `src/plan/print.css` | P4 |

## Traceability — extended features

| # | Feature | Implementation | Phase |
|---|---|---|---|
| 1 | Parent-company roll-up | `Company.parentCompanyId`; `src/engine/companies.ts#resolveParent`; shown in `PoliticalExposure` drill, merchant chips, sankey tooltip | P1/P3 |
| 2 | Provenance badging | `src/components/ProvenanceBadge.tsx` + `DataSourcesModal.tsx` (OpenSecrets / FEC / Goods Unite Us) | P2/P3 |
| 3 | Unknown-exposure honesty | `political.ts` keeps `unknown` slice; `PoliticalExposure` callout "X% can't be assessed" | P3 |
| 4 | Pareto free wins | `engine/plan.ts#freeWin`; `ParetoScatter` quadrant labels; free-win tag + gate-1 priority | P3/P4 |
| 5 | Effort-budgeted gates + trajectory | `engine/plan.ts#fillGates`, `#projectTrajectory`; `GateConfig` editable budgets; `Trajectory.tsx` | P4 |
| 6 | Investments module | `src/wizard/steps/Step5Investments.tsx`, `src/engine/investments.ts` (sleeves, investment buckets, class-only scenarios), sankey Investments lens, `InvestmentsDisclaimer.tsx` | P2/P3 |
| 7 | Local multiplier note | `src/components/MultiplierNote.tsx` rendered on local-shift actions | P4 |
| 8 | JSON export/import | `src/store/persistence.ts` (`exportState`, `importState` w/ validation), `src/store/migrations.ts` | P2/P5 |
| 9 | Community data-pack import | `docs/data-pack-schema.md`, `src/data/dataPack.ts` (validate + merge as `imported`), UI in Data sources page | P5 |
| 10 | CSV transaction import | "Coming soon" affordance in Step 4 (see ASSUMPTIONS) | P5 |

## Architecture

```
src/
  main.tsx, App.tsx (HashRouter: #/ wizard, #/dashboard, #/plan, #/data)
  engine/      types.ts, normalize.ts, alignment.ts, allocation.ts, score.ts, political.ts,
               gap.ts, heuristics.ts, plan.ts, investments.ts, index.ts + *.test.ts
  data/        companies.sample.json, principles.library.json, bucketDefaults.ts,
               goalModePresets.ts, categories.defaults.ts, fixtures/persona-jordan.json
  store/       useCompassStore.ts (zustand + persist, key compass.v1), migrations.ts,
               persistence.ts (export/import), selectors.ts (memoized scoring)
  wizard/      Wizard.tsx, StepRail.tsx, CategoryCard.tsx, MerchantPicker.tsx, steps/
  dashboard/   Dashboard.tsx, DashboardHeader.tsx, Dial.tsx, Sankey.tsx, SlopeChart.tsx,
               PoliticalExposure.tsx, PrinciplesRadar.tsx, ParetoScatter.tsx
  plan/        PlanPage.tsx, GateConfig.tsx, GateBoard.tsx, ActionCard.tsx, Trajectory.tsx,
               PlanPrintView.tsx, print.css
  components/  DualRange.tsx, Segmented.tsx, GoalModeToggle.tsx, ProvenanceBadge.tsx,
               DataSourcesModal.tsx, Disclaimers.tsx, Footer.tsx, NumberTick.tsx, …
  styles/      tokens.css (from reference :root), globals.css
docs/          BUILD-PROMPT.md, data-pack-schema.md
```

Scoring pipeline (pure): `store state → selectors.scoreAll(state, goalMode)` →
`{ overall, band, byCategory, political, radar, swaps, gates, trajectory }` memoized on
inputs; recomputed on any store change; must run < 100 ms for 12 × 4.
