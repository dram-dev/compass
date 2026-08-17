# Compass — values-aligned spend & investment planner

A local-first single-page app that helps a person align discretionary spending and investments with
their own stated principles. You describe your principles and weights, your current spending mix
(as honest ranges), and your own "optimal" — Compass scores alignment, maps where the money flows
(including named companies and their political-support profiles, relative to *your* preference),
visualizes the gap, and generates a printable, stage-gated action plan with tradeoff analysis.

**Neutral by design.** The app never editorializes about which values are right; every alignment display
is relative to your configuration (Aligned / Mixed / Opposed / Unknown), never absolute party framing.
**Private by design.** No backend, no network calls for user data — everything lives in versioned
`localStorage` with JSON export/import.

> Educational scenario tool — not financial, investment, or tax advice. Company political data varies
> by source and time; verify before acting.

## Live review build

**https://dram-dev.github.io/compass/** — deployed from `main` by `.github/workflows/deploy.yml`
(lint → test → build → GitHub Pages). It is the app exactly as this repo stands: local-first, no
backend, no runtime network calls; anything you enter stays in *your* browser's `localStorage` and
you can wipe it under **Data sources → Reset**. The build carries `noindex` and a disallow-all
`robots.txt` so it stays out of search results until it is announced; the URL itself is public, so
share it deliberately. A guard step in the workflow fails the deploy if any validation comparator
data (`data/validation/`, OpenSecrets CC BY-NC-SA / Goods Unite Us proprietary) ever reaches the
bundle.

**Reviewers in a hurry: open https://dram-dev.github.io/compass/#/demo** — that loads a fully worked
example (spending, portfolio, political preference, plan) with a banner saying it is illustrative and a
one-click clear. To try the CSV importer without a real bank export, use the "Download a sample file"
link inside the importer.

Reviewer path: **Wizard** (7 steps — step 4 is where the dual-range spend control lives, step 3 sets
the political preference that makes the political panels bite) → **Dashboard** (sankey with asset-lens
× current/optimal, political exposure, Pareto) → **Plan** (stage gates, trajectory, "Print / save as
PDF") → **Data sources** (fund look-through, political money facts, export/import).


## Setup

```bash
npm install
npm run dev        # http://localhost:5173  (dev builds show a "Load demo persona" button)
npm run build      # tsc -b && vite build → dist/  (base './' — deploys to any static host / GitHub Pages)
npm run test       # vitest (engine ≥ 90% coverage enforced with `npm run coverage`)
npm run lint       # eslint + prettier --check
```

Stack: Vite · React 18 · TypeScript (strict) · Tailwind 3 · Recharts 3 + a thin `d3-sankey` wrapper ·
Zustand (persist) · Vitest. Routes are hash-based (`#/wizard`, `#/dashboard`, `#/plan`, `#/data`).

Spec: `docs/BUILD-PROMPT.md`. Plan: `PLAN.md`. Every judgment call: `ASSUMPTIONS.md`.

## How the engine scores (spec §6)

All scoring is pure, deterministic TypeScript in `src/engine/`.

1. **Normalize weights** — `w_i = weight_i / Σ weights` across your principles.
2. **Alignment of a bucket or company** — `a = Σ_i w_i × (r_i / 2)`, ratings `r_i ∈ [−2, +2]`, so
   `a ∈ [−1, +1]`. A bucket portion with no named merchant uses the *bucket-default ratings* (table
   below, editable under Data → Advanced). A bucket with named merchants uses the equal-weight mean of
   those merchants (each merchant's missing ratings fall back to the bucket defaults). The `unknown`
   bucket is always `a = 0` and is excluded from the assessed portion of political displays.
3. **Category index** — bucket shares are the *midpoints* of your dual-thumb ranges, renormalized to
   100. `S_cat = Σ_b (m_b/100) × a_b`, displayed as `index = (S + 1)/2 × 100`.
4. **Alignment Index** — spend-weighted mean of category indices, one decimal. An **uncertainty band**
   is the index evaluated at every range-min and every range-max (renormalized), shown around the dial.
5. **Political exposure** — for a configured preference, `relative = leanScore × direction`:
   Aligned (≥ +1), Mixed (−1 < r < +1), Opposed (≤ −1); null lean, unnamed portions and the unknown
   bucket are **Unknown** — never hidden or redistributed. Unconfigured → everything Unknown and a
   one-tap setup link. The "Political alignment" *principle* rating is derived per company as
   `clamp(leanScore × direction × intensity, −2, 2)` (0 when unknown/unconfigured).
6. **Swaps & plan** — per category, the largest bucket decrease is paired with the largest increase
   (up to 3 candidates). `deltaIndexPoints` is the overall gain of that swap alone; `priority =
   Δ / effort`; `freeWin = Δ > 0 && cost ∈ {saves, neutral}`. Gates fill greedily by priority within
   each gate's effort budget, free wins first; manual drags are honored first; projections are
   cumulative and exact (the index is linear in shares).

Ground truth (`src/engine/workedExample.test.ts`): LocalEconomy 60 / Labor 40 → groceries 46.0,
dining 66.0, overall **54.0**; the grocery swap (major 40→20, local 30→50) → 62.0, **+9.6**, priority
4.8. Jordan (`src/engine/jordan.test.ts`): Local-first current **42.0**, optimal **58.9**, groceries swap
alone **+5.2** — parity with `reference/`.

### Bucket-default ratings (shipped; editable)

| Principle | Local independent | Regional chain | Major corporation | Unknown |
|---|---|---|---|---|
| Local economy | +2 | 0 | −2 | 0 |
| Labor practices | +1 | 0 | −1 | 0 |
| Environment | +1 | 0 | −1 | 0 |
| Political alignment | 0 (derived from lean) | 0 | 0 | 0 |
| Domestic manufacturing | +1 | 0 | −1 | 0 |
| Privacy | +1 | 0 | −1 | 0 |
| Animal welfare | 0 | 0 | 0 | 0 |

### How effort and cost are rated (`src/engine/heuristics.ts`)

Effort 1 = a habit tweak … 5 = a project. `costDelta` is the typical ongoing cost of moving money
*toward* the aligned destination for that category; moving away is treated as cost-neutral. Shifts of
≥ 30 percentage points add one effort point (capped at 5). Custom categories match by label keyword,
else the default row.

| Category archetype | Effort | Cost delta | Why |
|---|---|---|---|
| Groceries | 2 | neutral | Co-op / farmers-market staples price comparably; needs a route change |
| Dining & coffee | 1 | neutral | Choosing an independent café is a habit change |
| Fuel & auto | 2 | small | Fewer station choices; occasional detour |
| Retail & household | 2 | small | Independents rarely match big-box pricing on everything |
| Subscriptions & media | 1 | saves | Cancelling / consolidating overlapping services saves money |
| Banking & insurance | 4 | neutral | Account / policy migration is high effort, no ongoing cost |
| Personal care & services | 1 | small | Easy to switch; small price spread |
| Home improvement | 3 | moderate | Bidding to local contractors takes time; materials may cost more |
| Charitable giving | 1 | neutral | Redirecting a gift is a one-time decision |
| *(anything else)* | 2 | small | Assumed a modest habit change |

## Data provenance policy (spec §10)

- **Every company-level datum carries provenance** — `sample` (shipped), `user` (you rated/added it),
  `imported` (community data pack, with its source string) — rendered as a visible badge. Sample badges
  open the "Data sources & how to verify" modal (OpenSecrets · FEC.gov · Goods Unite Us) and sit next to a
  "Verify at source" link.
- **The shipped sample set (`src/data/companies.sample.json`, 60 records)** never asserts a real
  company's politics: 18 clearly *fictional archetypes* (NationalMart → Omnicorp Holdings, …) carry
  illustrative ratings and coarse `leanScore` placeholders (`confidence: 'low'`); 42 real US brands
  ship with public structure only (parent roll-up, sector, bucket default), `leanScore: null`, empty
  ratings (→ bucket defaults) and a hint to verify or import a data pack. No dollar figures, donation
  amounts, or recency claims anywhere.
- **Your edits win.** Rating/lean/bucket edits are stored as overrides with `provenance: 'user'` and
  override sample and imported values everywhere.
- **Unknown is first-class** — never hidden, never redistributed; every political panel says how much
  spend can't be assessed yet and how to tighten it.
- **Political axis convention** (`docs/data-pack-schema.md`, ASSUMPTIONS #17): `leanScore` negative =
  conservative/Republican-leaning giving, positive = progressive/Democratic-leaning; the wizard asks
  which end is aligned with *you*; all displays are orientation-neutral and never party-colored.
- Persistent footer disclaimers on every page; the investments module speaks in vehicle classes only.

## Traceability (spec §14)

### Hard requirements

| ID | Requirement | Implementing files | See it in the app |
|---|---|---|---|
| R1 | Wizard / survey | `src/wizard/WizardPage.tsx`, `StepRail.tsx`, `steps/Step1Intent…Step7Review.tsx` | `#/wizard` — 7 steps, rail is clickable, state persists per keystroke (refresh at any step) |
| R2 | Current mix with dual-thumb ranges | `src/components/DualRange.tsx` (Pointer Events), `src/wizard/CategoryCard.tsx`, `src/engine/allocation.ts` | Wizard step 4: four ranges per category, renormalized-midpoint bar |
| R3 | Companies + political mapping | `src/engine/political.ts`, `src/dashboard/PoliticalExposure.tsx`, `src/dashboard/Sankey.tsx` (hover) | Dashboard §03 drill-down (parent roll-up, badge, verify link); Sankey hover |
| R4 | Goal toggle | `src/components/GoalModeToggle.tsx`, `store.setGoalMode` | Wizard step 1 + sticky dashboard header — re-scores every visual live |
| R5 | Sankey (lens × state) + slope | `src/dashboard/Sankey.tsx`, `SlopeChart.tsx` | Dashboard §01 (Spending/Investments × Current/Optimal, 300 ms crossfade), §02 |
| R6 | Stage-gate plan + trajectory | `src/engine/plan.ts`, `src/plan/PlanPage.tsx`, `GateConfig.tsx`, `ActionCard.tsx`, `Trajectory.tsx` | `#/plan` — gates, budgets, badges, projected trajectory |
| R7 | Tradeoff visuals | `src/dashboard/ParetoScatter.tsx`, `src/plan/ActionCard.tsx` | Dashboard §05 quadrants; impact/effort/cost badges on every action |
| R8 | User-defined optimal | `steps/Step6Optimal.tsx`, `Step2Principles.tsx`, `src/components/CompanyRatingEditor.tsx`, `BucketDefaultsPanel.tsx`, `src/data/goalModePresets.ts` | Step 6 (preset prefill, every range editable, reset), rate any merchant, Advanced defaults |
| R9 | Printable plan | `src/plan/PlanPage.tsx`, `src/plan/print.css` | `#/plan` → "Print / save as PDF" — cover, gates, trajectory, before/after, footnote |

### Extended features

| # | Feature | Implementing files | See it in the app |
|---|---|---|---|
| 1 | Parent-company roll-up | `Company.parentCompanyId`, `src/engine/political.ts#resolveParent`, `MerchantPicker.tsx` | Merchant chips ("NationalMart → Omnicorp Holdings"), political drill-down, sankey hover |
| 2 | Provenance badging | `src/components/ProvenanceBadge.tsx`, `DataSourcesModal.tsx` | Every chip / drill row / holding match; badge opens the verify modal |
| 3 | Unknown-exposure honesty | `src/engine/political.ts`, `PoliticalExposure.tsx` | Dashboard §03 hatched Unknown slice + "X% can't be assessed" callout |
| 4 | Pareto free wins | `src/engine/plan.ts#isFreeWin`, `ParetoScatter.tsx`, `ActionCard.tsx` | §05 quadrant labels; FREE WIN tag; free wins float to gate 1 |
| 5 | Effort-budgeted gates + trajectory | `src/engine/plan.ts#fillGates`, `GateConfig.tsx`, `Trajectory.tsx` | Plan → Gate configuration (cadence, budgets, add/remove), trajectory chart |
| 6 | Investments module | `steps/Step5Investments.tsx`, `src/engine/investments.ts`, `Sankey.tsx` (Investments lens), `Disclaimers.tsx` | Step 5; dashboard Investments lens (sleeves → buckets); plan §04 vehicle-class scenarios |
| 7 | Local multiplier context | `src/components/Disclaimers.tsx#MultiplierNote`, `ActionCard.tsx` | `local ≈2–3×*` chip on local-shift actions + one illustrative footnote |
| 8 | JSON export/import | `src/store/persistence.ts`, `validate.ts`, `migrations.ts` | Data → Export JSON / Import JSON (file or paste); malformed input → specific error |
| 9 | Community data-pack import | `docs/data-pack-schema.md`, `src/data/dataPack.ts`, `DataSourcesPage.tsx` | Data → Community data packs (import / example download); records badged Imported · source |
| 10 | CSV transaction import | `src/lib/csv.ts`, `src/lib/transactions.ts`, `src/components/CsvImportPanel.tsx`, `store#applyTransactionImport`, `docs/csv-import.md` | Wizard step 4 → "Import CSV", or Data → "Import a statement CSV": bank/card export → merchants grouped, categories and monthly totals filled in, unknown merchants offered for classification, preview before apply |
| 11 | Political streams (PAC / employees / executives) | `scripts/seed/fec.mjs#isExecutiveOccupation`, `political.mjs#streamLean`, `PoliticalFactsPanel.tsx` | Data §06 fact cards — three bars, each with its own lean beside the pooled one |
| 12 | Lobbying topics + P1 (Axis-2 inputs, activity not position) | `scripts/seed/lobbying-topics.mjs`, `db/schema.sql#lobbying_filing_topic`, `PoliticalFactsPanel.tsx#ProtectionPanel` | Data §06 "Lobbying topics" panel — weighted vs any-code trade/tariff share, topic chips, filing links |
| 13 | Political benchmark harness | `scripts/seed/validate-political.mjs`, `docs/political-benchmark.md` | `npm run validate:political` |
| 14 | Demo scenario | `src/components/Demo.tsx`, `src/lib/useDemo.ts`, `src/data/fixtures/persona-jordan.json`, `public/sample-statement.csv` | `#/demo` (shareable), or the buttons in wizard step 1 and the dashboard/plan empty states — loads the worked persona with a "Demo data" banner and one-click clear |
| 15 | Simple / Detailed density toggle | `src/store/useViewMode.ts`, `src/components/ViewModeToggle.tsx`, `src/components/Section.tsx#sectionNumbers`, `src/wizard/stepList.ts` | Header switch: simple walks a 3-step wizard and 3 dashboard panels; detailed shows all 7 steps and every panel |
| 16 | 40-firm validation + position-coding kit (Phases B/D) | `scripts/seed/validation-lib.mjs`, `validate-political.mjs sample / review-template / validate / position-sample / position-kappa`, `data/validation/*`, `docs/codebook-lobbying-position.md`, `docs/political-validation.md` | `data/validation/README.md` — human steps; results in `docs/political-validation.md` |

## Research database (company financials + fund concentration graph)

`scripts/seed/` builds an **offline** SQLite database (`db/compass.sqlite`, git-ignored) of real company
financials (SEC XBRL filings, Alpha Vantage enrichment) and a connection graph from the ~200 most-held
ETFs/mutual funds (SEC N-PORT holdings, ranked by net assets) to the companies they hold — with
fund-of-funds look-through — then exports `src/data/generated/fund-concentration.json` for the app's
**Data → Fund look-through** panel: which companies the fund universe concentrates in, who holds a given
company, a fund's top holdings, and each fund's **political exposure** (share of assets in Aligned / Mixed /
Opposed / Unknown companies relative to your preference, from the FEC/LDA leans). The app never fetches at
runtime — seeding is a maintainer step; the shipped exports were generated 2026-08-17.

```bash
cp .env.example .env     # ALPHAVANTAGE_API_KEY (ETF profiles, company data) + SEC_USER_AGENT (mutual-fund N-PORT holdings)
npm run seed             # funds → rank → companies → graph; resumable, disk-cached, throttle-aware
npm run seed:status
```

Full details, schema, rate-limit strategy and ranking rules: `docs/research-db.md`.

**Political-money facts** (`npm run seed:political`, no key needed): FEC bulk data — corporate PAC,
employee and senior-executive contributions by recipient party over three cycles — plus Senate LDA
lobbying filings, matched to companies with an auditable, conservative name matcher, reduced to a
documented lean with the three streams also shown separately (`docs/political-seed.md`), plus lobbying
**topic** flags and the P1 trade-protection share (activity, never position — the Axis-2 inputs from
`docs/PLAN-political-axes.md`), and exported both as facts for the **Data → Political money facts** panel
and as a standard data pack the user loads on click (Imported badges + verify links; nothing fetched at
runtime). `npm run validate:political` checks the stream distributions against the published
corporate-PAC benchmark.

## Testing

- `src/engine/*.test.ts` — worked example (exact), Jordan parity, allocation, alignment, political,
  plan (incl. reallocation math), investments, radar, heuristics, companies/data integrity.
- `src/store/store.test.ts` — actions, goal-mode semantics, export → clear → import identity,
  validation errors, migrations.
- Component tests: DualRange (pointer + keyboard), wizard, dashboard (zero-data + Jordan + toggles),
  plan (move / dismiss / highlight / gate config), data page (round trip, packs, Advanced), error boundary.
- `scripts/seed/seed.test.mjs`, `political.test.mjs` — Alpha Vantage / SEC N-PORT / FEC bulk / LDA parsers against real payload shapes, org-name matcher rules, lean derivation, in-memory SQLite ranking, graph and pack export.
- `npm run coverage` enforces ≥ 90% lines/functions/statements on `src/engine`.

## Privacy

State is stored under `localStorage['compass.v1']` (`schemaVersion` inside; `src/store/migrations.ts`
upgrades older files). Nothing leaves the device unless you export it or click a verification link.
The dev-only "Load demo persona" button and `?demo=1` boot flag are compiled out of production builds.
