# CLAUDE CODE BUILD PROMPT — Values-Aligned Spend & Investment Planner
**Working title: "Compass" (rename freely if you propose something better in ASSUMPTIONS.md)**

> **Reference implementations:** two working single-file demos ship with this spec in `reference/` — the dashboard (`compass-demo.html`) and wizard step 4 (`compass-wizard.html`). They are the visual and interaction ground truth for §8 and §11 and compute the §6.5 numbers; treat them as extractable patterns and throwaway code, not a codebase to extend.

---

## 0. Operating posture

You are Claude Code running Opus at maximum effort. Read this entire prompt before writing any code. Then:

1. **Plan first.** Produce `PLAN.md` mapping every Hard Requirement (§2) and Extended Feature (§3) to a component, file, and phase before scaffolding.
2. **Run autonomously.** Do not ask questions. Make reasonable decisions and log every one in `ASSUMPTIONS.md` with rationale.
3. **Phase gates.** Follow the delivery plan in §13. Do not advance a phase until its gate criteria pass. Run build + tests at every gate.
4. **No fabricated real-world data presented as fact.** §10 is non-negotiable and overrides feature ambition. If a feature would require inventing real political-donation figures, ship the provenance-badged sample-data version instead.
5. **Low rework is the success metric.** Prefer boring, correct, well-typed code over cleverness. The deterministic engine (§6) with its worked-example test is your anchor — if that test passes and the traceability table (§14) is complete, you have succeeded.

---

## 1. Product definition

A local-first single-page web app that helps a person align their discretionary spending and investments with their own stated principles. The user completes a wizard that captures (a) their core principles and weights, (b) their current spending and investment mix, and (c) their self-defined "optimal" mix. The app scores current alignment, maps where money flows today (including which companies and their political-support profiles), visualizes the gap between current and optimal, and generates a beautiful, printable, stage-gated action plan with tradeoff analysis.

**Neutrality is a design principle.** The app never editorializes about which values are correct. It takes the user's stated principles — whatever they are, in any political direction — and optimizes toward them. All alignment displays are relative to the user's own configuration (Aligned / Mixed / Opposed / Unknown), never absolute party framing.

**Privacy is a feature.** No backend, no network calls for user data, everything in localStorage with JSON export/import. State this in the UI footer.

---

## 2. Hard requirements (all must ship)

Every item below must appear in the final traceability table (§14).

- **R1 — Wizard/survey.** A multi-step guided flow (§7) that captures principles, current mix, and user-defined optimal.
- **R2 — Current mix inventory with ranges.** Per spending category, the user sets the share of spend going to each destination bucket using **dual-thumb range sliders** (min–max %). Buckets must include, at minimum, **% Local independent** and **% Major corporation** (plus Regional chain and Unknown/Other to complete the partition). Ranges, not point estimates — the engine uses midpoints and displays the band.
- **R3 — Mapping of choices to companies and political support.** The analysis must show where discretionary spend is going (category → bucket → named companies where the user has named them) and each company's political-support profile (lean, rendered relative to the user's stated preference), subject to the data-integrity rules in §10.
- **R4 — Goal toggle.** A persistent, prominent toggle/segmented control for what the user wants to accomplish (goal modes, §7 step 1). Switching modes re-weights scoring and re-renders all visuals live.
- **R5 — Visual current → optimal mapping.** At minimum: a Sankey flow diagram with an asset lens (Spending / Investments) and a Current/Optimal state toggle, and per-category slope (dumbbell) charts (§8).
- **R6 — Goal-setting module with stage-gate recommendations.** Concrete recommended actions ("swaps") allocated to user-configurable stage gates (default 30/60/90 days), each with impact, effort, and cost-delta ratings, plus a projected alignment trajectory (§9).
- **R7 — Integrated tradeoff visualizations.** At minimum the Pareto scatter (§8.6) plus impact/effort/cost badges on every recommended action.
- **R8 — "Optimal" is defined by the user.** Goal-mode presets may prefill targets, but every target range, principle weight, and company rating is user-editable. The app never locks the user into its defaults.
- **R9 — Beautiful visual action plan.** A dedicated, print-optimized plan view (§9.4) that reads as a polished document, not a screen dump.

---

## 3. Extended features (ship these unless they conflict with §2)

These are deliberate additions — do not silently drop them. If one must be cut for time, cut from the bottom of this list and record it in ASSUMPTIONS.md.

1. **Parent-company roll-up.** Brands map to parents (`parentCompanyId`), and the analysis surfaces the roll-up ("Brand X → Conglomerate Y") so users see who ultimately receives the money.
2. **Provenance badging.** Every company-level data point carries provenance (`sample` / `user` / `imported`) rendered as a visible badge; sample data always links out to verification sources (§10).
3. **Unknown-exposure honesty.** "Unknown" is a first-class slice in every political/values breakdown — never hidden, never redistributed. Include a callout: "X% of your spend can't be assessed yet — name merchants or adjust buckets to improve accuracy."
4. **Pareto "free wins."** The tradeoff scatter labels quadrants; actions with high alignment gain and ≤ zero cost delta get a "Free win" tag and float to the top of gate 1 candidates.
5. **Effort-budgeted gates with trajectory.** Each stage gate has an editable effort budget; the plan generator fills gates greedily by priority within budget and charts the projected Alignment Index across gates.
6. **Investments module** (wizard step 5): holdings inventory scored with the same engine, scenario-reallocation recommendations by vehicle *class* only (e.g., "local credit union deposits," "community investment notes," "a values-screened index fund you select"), with a persistent "educational scenarios, not financial advice" disclaimer. Never recommend specific real funds or securities by name. For the flow diagram, group holdings into sleeves (cash & deposits, retirement funds, individual equities, community notes, alternatives/crypto).
7. **Local economic multiplier context.** Where local-spend shifts are recommended, show an illustrative multiplier note ("studies commonly estimate ~2–3× more local recirculation per dollar at independents"), clearly labeled as illustrative and directionally sourced, not precise.
8. **JSON export/import** of the full user state; versioned schema with migration scaffold.
9. **Community data-pack import.** Document a JSON schema (`docs/data-pack-schema.md`) so users can import third-party or self-researched company datasets; imported records get `provenance: 'imported'` with a source string.
10. **CSV transaction import (stretch — optional).** Parse a bank/card CSV to prefill category totals. If time-constrained, ship the UI affordance as "coming soon" and note in ASSUMPTIONS.md.

---

## 4. Stack & architecture

- **Vite + React 18 + TypeScript (strict).** No backend. No network calls except user-initiated external "verify source" links (open in new tab).
- **Tailwind CSS** for styling (design direction in §11 — do not ship a default-template look).
- **Charts:** Recharts for gauge/slope/scatter/stacked-bar/line; `d3-sankey` (thin custom React wrapper) for the flow diagram. All charts render as SVG so the print view works natively.
- **Dual-range control:** custom Pointer Events implementation exactly as demonstrated in `reference/compass-wizard.html` (pointer capture, `touch-action:none`, keyboard + ARIA slider semantics). Paired native `<input type=range>` relying on pseudo-element pointer-events is forbidden — it fails on Android touch and on Firefox entirely.
- **State:** Zustand store, persisted to localStorage under a versioned key (`compass.v1`). Selectors memoized; a full re-score across 12 categories × 4 buckets must complete in **< 100 ms**.
- **Testing:** Vitest. The scoring engine (§6) is pure functions with **≥ 90% coverage**, including the mandatory worked-example test (§6.5).
- **Quality:** ESLint + Prettier configured; `npm run build`, `npm run test`, `npm run lint` all clean at every phase gate.
- **Structure:**

```
src/
  engine/        // pure scoring, gap, plan-generation functions + tests
  data/          // companies.sample.json, principles.library.json, fixtures/
  store/         // zustand slices, persistence, migrations
  wizard/        // step components
  dashboard/     // visualization components
  plan/          // action plan view + print styles
  components/    // shared UI primitives
docs/            // data-pack-schema.md, README sections
```

---

## 5. Data model (TypeScript — implement exactly; extend, don't rename)

```ts
type Provenance = 'sample' | 'user' | 'imported';
type BucketId = 'local' | 'regional' | 'major' | 'unknown';

interface Principle {
  id: string;
  label: string;            // e.g., "Local economy", "Labor practices",
                            // "Environment", "Political alignment",
                            // "Domestic manufacturing", "Privacy", "Animal welfare"
  weight: number;           // 0–100, normalized at scoring time
  custom: boolean;
}

interface PoliticalProfile {
  leanScore: number | null;      // -2..+2 on a conventional US party axis; null = unknown
  confidence: 'low' | 'med' | 'high';
  sourceHint: string;            // e.g., "FEC PAC filings — verify via OpenSecrets"
  provenance: Provenance;
}

interface Company {
  id: string;
  name: string;
  parentCompanyId?: string;
  sector: string;
  bucketDefault: BucketId;
  political: PoliticalProfile;
  ratings: Record<string, number>;  // principleId -> -2..+2
  ratingsProvenance: Provenance;
}

interface BucketAllocation {
  bucket: BucketId;
  rangePct: [number, number];    // dual-thumb slider values; midpoints renormalized to 100
  namedCompanyIds: string[];     // optional user-named merchants in this bucket
}

interface SpendCategory {
  id: string;
  label: string;                 // defaults: Groceries; Dining & coffee; Fuel & auto;
                                 // Retail & household; Subscriptions & media;
                                 // Banking & insurance; Personal care & services;
                                 // Home improvement; Charitable giving (optional)
  monthlySpend: number;
  current: BucketAllocation[];
  target: BucketAllocation[];    // user-defined "optimal"
}

interface Holding {
  id: string;
  label: string;                 // ticker or free text
  type: 'cash' | 'equity' | 'fund' | 'crypto' | 'other';
  amount: number;
  ratings: Record<string, number>;   // same -2..+2 scale
  political: PoliticalProfile | null;
}

type GoalMode = 'local-first' | 'political-alignment' | 'cost-conscious' | 'divest-redirect' | 'custom';

interface UserPoliticalPreference {
  configured: boolean;
  direction: -1 | 1 | 0;         // which end of leanScore the user considers aligned; 0 = issue-based only
  intensity: number;             // 0–1, scales how strongly political exposure feeds scoring
}

interface SwapAction {
  id: string;
  categoryId: string;
  description: string;           // e.g., "Shift ~15% of grocery spend from major chains to the co-op"
  deltaIndexPoints: number;      // projected Alignment Index gain
  effort: 1 | 2 | 3 | 4 | 5;
  costDelta: 'saves' | 'neutral' | 'small' | 'moderate';
  freeWin: boolean;
  gateId: string | null;
}

interface StageGate {
  id: string;
  label: string;                 // "Day 30" / "Q1" etc.
  effortBudget: number;          // default 8
  actions: string[];             // SwapAction ids
  projectedIndex: number;
}
```

---

## 6. Scoring engine (pure, deterministic, unit-tested)

### 6.1 Normalization
`w_i = weight_i / Σ weights` across active principles.

### 6.2 Alignment of a company or bucket
`a = Σ_i w_i × (r_i / 2)` where `r_i ∈ [-2, +2]` → `a ∈ [-1, +1]`.
Buckets without named companies use bucket-default ratings (defined in `data/bucketDefaults.ts`, user-editable in an "Advanced" panel). If a bucket contains named companies, its `a` is the spend-weighted mean of those companies (equal weights within the bucket unless the user sets per-merchant shares — keep equal weights for v1). `unknown` bucket has `a = 0` and is excluded from the political breakdown's assessed portion.

### 6.3 Category and overall scores
Bucket share `m_b` = midpoint of `rangePct`, renormalized so Σ m_b = 100.
`S_cat = Σ_b (m_b/100) × a_b` → displayed as index `(S_cat + 1) / 2 × 100`.
`AlignmentIndex = Σ_cat (spend_cat / totalSpend) × index_cat`, one decimal.
Also compute an uncertainty band by evaluating at range-min and range-max allocations (clamped, renormalized) and display it as a subtle band around the headline number.

### 6.4 Political exposure
For each company/bucket with a non-null `leanScore` and a configured `UserPoliticalPreference`, classify relative alignment: `relative = leanScore × direction` → **Aligned** (≥ +1), **Mixed** (−1 < relative < +1), **Opposed** (≤ −1); null lean or unnamed bucket portions → **Unknown**. Output: % of monthly discretionary spend in each class, current vs. optimal. If preference is not configured, the political panel renders in a "not configured" state with a one-tap setup link — never guess the user's politics.

### 6.5 Mandatory worked-example test (ground truth — must pass exactly)
Principles: LocalEconomy w=60, Labor w=40 → normalized 0.6 / 0.4.
Bucket ratings: local {Local:+2, Labor:+1} → a=0.8; major {Local:−2, Labor:−1} → a=−0.8; regional and unknown → a=0.
Groceries $600, midpoints local 30 / regional 20 / major 40 / unknown 10 → S = −0.08 → index **46.0**.
Dining $400, midpoints local 60 / regional 10 / major 20 / unknown 10 → S = 0.32 → index **66.0**.
**Overall AlignmentIndex = 54.0.**
Swap test: Groceries major 40→20, local 30→50 → category index 62.0; overall Δ = **+9.6** points; with effort 2, priority = 4.8. Encode both as Vitest assertions.

### 6.6 Gap, swaps, and prioritization
For each category, gap = target midpoints − current midpoints. Generate candidate `SwapAction`s from the largest per-category bucket shifts (cap ~3 candidates per category; write descriptions in concrete consumer language — name the user's named merchants when available, otherwise the bucket). `priority = deltaIndexPoints / effort`; `freeWin = deltaIndexPoints > 0 && costDelta ∈ {saves, neutral}`. Effort and costDelta come from a small heuristic table in `engine/heuristics.ts` (e.g., switching banks = effort 4; shifting grocery share = effort 2; canceling a subscription = effort 1, costDelta 'saves') — document the table in the README so users understand the ratings.

---

## 7. Wizard flow (7 steps; progress bar; every step revisitable; state persists per keystroke)

1. **Intent.** Goal-mode segmented control: *Local-first · Political alignment · Cost-conscious values · Divest & redirect · Custom*. Each mode sets default principle weights and target presets, with one-line explanations. This same control persists in the dashboard header (R4) and re-scores live.
2. **Principles.** Pick from the library + add custom; weight sliders with a live normalized-share readout.
3. **Political preference (optional, explicitly private).** Direction + intensity, or Skip. Copy must state it's stored only on-device and only used to orient the "relative to you" displays.
4. **Current spend inventory.** Monthly spend per category (add/remove/rename categories); per category, the four-bucket **dual-thumb range sliders** with a live renormalized-midpoint bar; optional merchant naming per bucket via typeahead over the sample dataset + free-text add (free-text creates a `provenance:'user'` company with unrated defaults and a prompt to rate it).
5. **Investments (optional).** Holdings table; rate via dataset match or manual sliders; the advice disclaimer appears here first and on every investments panel thereafter.
6. **Define your optimal.** Same controls as step 4 but for targets, prefilled from the goal-mode preset, fully editable (R8). Show live projected AlignmentIndex as they adjust.
7. **Review & generate.** Summary of inputs → "Build my plan" → dashboard.

---

## 8. Dashboard visualizations (single scrolling view with sticky goal toggle)

1. **Header:** AlignmentIndex gauge with uncertainty band, current vs. optimal target marker; goal-mode toggle; total monthly discretionary spend.
2. **Sankey (two controls):** an asset lens (Spending / Investments) plus a Current/Optimal state toggle, 300 ms crossfade on either. Spending lens: categories (left) → buckets (right), link width = dollars/mo. Investments lens: holding sleeves (left) → investment buckets (Community-aligned / Broad-market mixed / Major-corp concentrated / Unknown-unrated); legend labels swap per lens and the vehicle-class-only advice disclaimer renders only on this lens. Hovering a link shows dollars, share band, and named companies with provenance badges.
3. **Category slope chart:** per-category dumbbells, current index → target index, sorted by gap.
4. **Political exposure:** stacked bars (Aligned / Mixed / Opposed / Unknown) for current vs. optimal; every assessed segment expandable to the contributing companies with parent roll-up, provenance badge, and "Verify at source" external link (§10). Unconfigured state per §6.4.
5. **Principles radar:** current vs. optimal coverage per principle.
6. **Tradeoff scatter (Pareto):** x = cost delta (saves → moderate), y = alignment gain, bubble = monthly dollars affected, quadrant labels ("Free wins," "Pay to align," "Low stakes," "Reconsider"); clicking a bubble scrolls to that action in the plan.
7. **Color semantics:** encode *relative* alignment only — e.g., verdant (aligned), rust/amber (opposed), slate (mixed), dotted grey (unknown). **Never** red-vs-blue party coloring.

---

## 9. Goal-setting module & action plan

1. **Gate configuration:** cadence presets (30/60/90 days · quarterly · custom), editable labels and per-gate effort budgets (default 8).
2. **Plan generation:** greedy fill by `priority` within each gate's budget, free wins first; user can drag actions between gates (recompute projections on drop) or dismiss actions (excluded and remembered).
3. **Trajectory:** line chart of projected AlignmentIndex from today through each gate to the optimal target; annotate each gate with its top action.
4. **Print view (R9):** dedicated `/plan` route with Letter/A4 print CSS: cover block (user's name optional, date, goal mode, index now → target), per-gate sections with action cards (impact / effort / cost badges), the trajectory chart, the political-exposure before/after, and a data-provenance footnote. Must survive browser Print-to-PDF as a clean multi-page document with no clipped charts. This is the artifact the user shares — treat its typography and spacing as a first-class deliverable.

---

## 10. Data integrity & ethics rails (non-negotiable)

1. Ship `data/companies.sample.json`: 40–60 widely known US brands with parent roll-ups, sector, bucket defaults, principle ratings, and political profiles. **All sample political and values ratings are illustrative.** Do not invent dollar figures, specific donation amounts, or claim recency. `leanScore` in sample data is a coarse directional placeholder with `confidence: 'low'` and `sourceHint` pointing to real verification sources.
2. Every UI surface showing sample-derived company data displays a **"Sample — verify"** badge and an external link: OpenSecrets organization search, FEC.gov, and Goods Unite Us (list all three in a "Data sources & how to verify" modal reachable from the badge).
3. User edits to any rating are stored as overrides with `provenance:'user'` and win over sample values everywhere.
4. Persistent app-footer disclaimers: (a) "Educational scenario tool — not financial, investment, or tax advice." (b) "Company political data varies by source and time; verify before acting."
5. The unknown class is never hidden or redistributed (§3.3).
6. If any instruction elsewhere in this prompt conflicts with this section, this section wins.

---

## 11. Design direction

Distinctive and editorial — this must not look like a default component-library dashboard. Choose a confident pairing (e.g., a humanist serif for display, a grotesk for UI, via Fontsource — your pick, log it), a restrained neutral field with the semantic hues from §8.7 as the only strong color, generous whitespace, hairline dividers, and tabular numerals for all figures. Subtle motion only: number tick-ups on score changes, the Sankey crossfade, `prefers-reduced-motion` respected. The print view should feel like a well-set report. Accessibility: full keyboard operability in the wizard (sliders included), ARIA labels on all inputs and charts, WCAG AA contrast. The reference demos implement this direction; their `:root` tokens, type stacks, dial construction, and chart idioms are canonical — deviate only with a logged reason.

---

## 12. Persistence, fixtures, and the test persona

- Versioned localStorage (`schemaVersion` field; `store/migrations.ts` scaffold with a no-op v1 migration).
- JSON export/import of complete state; malformed imports fail gracefully with a specific error, never a crash or silent partial load.
- `data/fixtures/persona-jordan.json`: **Jordan** — $3,800/mo across 8 default categories, goal mode Local-first, principles LocalEconomy 60 / Labor 25 / Environment 15, a handful of named merchants from the sample dataset, targets set for roughly a +20-point index gain. A dev-only "Load demo persona" button (visible only in dev builds) loads it. Use Jordan for every phase-gate walkthrough and screenshot.

---

## 13. Phased delivery with gate criteria

- **P0 — Scaffold.** Vite/React/TS/Tailwind/Zustand/Vitest wired; scripts run. *Gate:* dev server up; lint + typecheck clean; PLAN.md and ASSUMPTIONS.md exist.
- **P1 — Engine + data.** Types (§5), engine (§6), sample dataset, bucket defaults, heuristics table, fixtures. *Gate:* all tests pass including §6.5 exactly; ≥ 90% engine coverage.
- **P2 — Wizard.** All 7 steps with validation and per-keystroke persistence. *Gate:* full Jordan walkthrough; hard-refresh restores state at any step.
- **P3 — Dashboard.** All §8 visuals live on Jordan. *Gate:* goal-mode toggle re-scores and re-renders < 100 ms; every chart renders with zero-data and partial-data states handled.
- **P4 — Plan.** §9 complete including print view. *Gate:* Print-to-PDF of `/plan` yields a clean multi-page document; drag-between-gates recomputes projections correctly (add a unit test on the reallocation math).
- **P5 — Polish & ship.** Empty/error states, a11y pass, import/export, data-pack schema doc, README (setup, engine explanation, heuristics table, data provenance policy, traceability table). *Gate:* §14 checklist fully green.

After each gate: run build + tests, walk Jordan end-to-end through everything built so far, and fix regressions before proceeding.

---

## 14. Definition of done

README.md must contain a traceability table: every ID R1–R9 and Extended Features 1–9 (10 optional) mapped to the implementing file(s)/component(s) and how to see it in the running app. Plus, all of:

- [ ] `npm run build`, `test`, `lint` clean; engine coverage ≥ 90%
- [ ] Worked-example test (§6.5) passes with exact expected values
- [ ] Jordan persona: wizard → dashboard → plan → print, no console errors
- [ ] Provenance badges + verify links on every sample-derived company datum
- [ ] Political panel correct in both configured and unconfigured states; Unknown always visible
- [ ] Both disclaimers persistent; investments module never names specific real funds/securities as recommendations
- [ ] Goal toggle live-re-scores everywhere it appears
- [ ] Export → clear storage → import restores identical state
- [ ] ASSUMPTIONS.md lists every judgment call, cut, and rename
