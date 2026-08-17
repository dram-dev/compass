# Deployment plan — two political axes (from the 2026-08-17 deep-research memo)

Source: `docs/research-political-axes.md` (26 sources, 25 claims adversarially verified, 0 refuted).
This plan turns the memo's top findings into staged work with gates, in the order that de-risks the
result fastest: machine-only steps first, the two human-in-the-loop experiments in parallel, and the
expensive scale-up only after the decisive κ test.

## What we learned (top findings, ranked by how much they change what we ship)

1. **Axis 1 (D↔R) is solved — confirm, don't rebuild.** The peer-reviewed recipe (FEC bulk, PAC and
   employee streams, conduit rows excluded, JFC party inferred, `r=(R−D)/(R+D)`) is what Compass
   already runs. The gap is presentation and validation, not method.
2. **PAC money and executive/employee money are different signals and must be shown separately.**
   >¾ of corporate-elite dollars come from strong partisans vs 2–3% for PACs; PACs follow majority
   control ("investors"). This is exactly where OpenSecrets (blended) and Goods Unite Us (PAC + senior
   execs) diverge. One pooled number hides it.
3. **"Mixed" is the correct modal answer.** Benchmark for corporate PACs: 47.4% R of D+R, IQR 21–72%
   (2,456 public firms, 1980–2018). Our distribution should look like that; if it doesn't, the
   matcher is wrong, not the companies.
4. **Three cycles beat two**, and an **executive sub-tier** (occupation keywords) is cheap and makes a
   GUU-comparable figure available.
5. **The legal line is aggregation.** FEC AOs 2014-07, 2015-12, 2017-08 (Point Bridge — a company
   index), 2022-10 permit commercial display of aggregated non-identifying data; individual donor rows
   never. Compass complies today; keep it that way in every new export.
6. **Axis 2 (protection ↔ open market) has no validated published score.** It has to be built as a
   composite of transparent sub-scores from primary data — lobbying topics (LDA issue codes TAR/TRD;
   antitrust hidden inside LBR; no procurement/subsidy code), and protection-seeking *behaviour*
   (tariff-exclusion requests, subsidies, federal-contract dependence).
7. **Topic ≠ position.** Codes say what a firm lobbied on, not which way. Whether position can be
   coded reliably is an open question the research could not answer — so it becomes our decisive
   experiment (two raters, one-page codebook, Cohen's κ). κ ≥ 0.7 → scale with a reviewed classifier;
   κ < 0.7 → ship topic/behaviour only and call the axis "protection-seeking activity".
8. **Licensing shapes the build.** Ship: FEC, LDA, USAspending, QuantGov, DIME (ODC-BY). Validation
   only, never bundled: OpenSecrets (CC BY-NC-SA), Goods Unite Us (proprietary), LobbyView
   (non-commercial), Good Jobs First (internal use).

## Where we stand (2026-08-17)

| Asset | State |
|---|---|
| FEC PAC + employee aggregates | 342 companies, cycles 2022 + 2024, indiv files cached locally (9.5 GB) — 2020 not yet downloaded |
| LDA lobbying | 12,208 filings, 174 clients, 162 companies with filings; each filing stores issue codes **and specific-issue text**; extended crawl (342-company universe) still running |
| Issue-code coverage | 102 filings tagged TAR, 2,253 tagged TRD — P1 is computable today |
| SEC XBRL revenue | 313 companies — denominators for P3/P4 exist |
| App | `leanScore` pooled; PoliticalFactCard + FundLookthroughPanel show FEC lean; no lobbying-topic display yet |

## Phases

Order: **A → C** (machine-only, ~2 days), then **B ∥ D** (human-in-the-loop, run in parallel), then
**E**, then **F** (conditional on D). Every gate: `npm run build && npm test && npm run lint` clean,
exports regenerated, ASSUMPTIONS.md updated, commit `PA<n>: <summary>`.

### Phase A — Axis 1 hardening (machine-only, ~1 day)

| # | Change | Files |
|---|---|---|
| A1 | Report streams separately: `pac`, `employee`, `executive` (subset of employee) each with `{r, lean, D, R, O, U, cycles}`; keep pooled `leanScore` for the engine | `scripts/seed/political.mjs` (computeLean per channel), `seed-political.mjs` (facts/export), `src/data/politicalFacts.ts`, `PoliticalFactCard.tsx` (two bars, executive callout), `docs/political-seed.md`, `docs/data-pack-schema.md` |
| A2 | Executive sub-tier: classify OCCUPATION with a documented keyword set (FOUNDER, CHAIRMAN, PRESIDENT, CHIEF, CEO, CFO, COO, GENERAL PARTNER, MANAGING PARTNER, DIRECTOR-of-board patterns) → channel `executive`; re-aggregate from cached indiv files (offline) | `fec.mjs` (aggregateEmployees), `db/schema.sql` (channel CHECK + rebuild path in `db.mjs`), `political.mjs` |
| A3 | Pool three cycles: add 2020 (`--cycles 2020,2022,2024`); keep per-cycle rows; confidence tiers re-derived on pooled totals | `config.mjs` default cycles, `seed-political.mjs`, ~+4 GB FEC download |
| A4 | Benchmark check: script prints PAC %R mean / IQR / 10th–90th for companies with a PAC vs BBFTY (47.4% / 21–72 / 0–100) and fails loudly on gross divergence | new `scripts/seed/validate-political.mjs` (`npm run validate:political`) |

Gate A: app shows PAC vs employees vs executives separately with provenance; distribution report in
`docs/political-seed.md`; no per-donor data anywhere in exports (test asserts it).

### Phase C — Axis 2 sub-scores computable today (machine-only, ~1 day)

| # | Change | Files |
|---|---|---|
| C1 | **P1 trade-protection lobbying**: per company, last 3 years — lobbying $ (per-period in-house-first rule) on filings whose codes include TAR or TRD, two attributions reported: *any-code* (full filing $) and *issue-weighted* (filing $ ÷ number of codes); filing counts | new view `v_lobbying_topic` + `scripts/seed/lobbying-topics.mjs` |
| C2 | **P5-topic screen**: keyword flags over specific-issue text (`antitrust`, `competition`, `merger`, `licens`, `certif`, `Buy American`, `domestic content`, `exclusion`, `tariff`, `quota`, `subsid`, `tax credit`), stored per filing with `method='keyword-v1'` | new table `lobbying_filing_topic`, `lobbying-topics.mjs` |
| C3 | Export `protectionActivity` block per company: `{coverageYears, lobbyTotal, tarTrd:{anyShare, weightedShare, filings}, topics:{...counts}, verify:[lda.gov filing URLs]}`; `null`/Unknown when no LDA client matched | `seed-political.mjs` (exportPoliticalFacts), `src/data/politicalFacts.ts` |
| C4 | App: second panel on `PoliticalFactCard` — "Protection-seeking activity (lobbying topics)", explicitly labelled *activity, not position*; Unknown state; verify links | `PoliticalFactCard.tsx`, `DataSourcesPage.tsx` section, tests |

Gate C: P1 shown for every company with LDA filings; wording reviewed against §10 (neutral, sourced,
Unknown never redistributed).

### Phase B — 40-firm validation harness (human-in-the-loop, ~2 days elapsed)

| # | Step | Owner |
|---|---|---|
| B1 | Stratified sample: 10 sample brands + 30 top-held, spread across SIC sectors and PAC / no-PAC → `data/validation/political-sample.json` (script) | machine |
| B2 | Hand-record comparators per firm: OpenSecrets org D/R % (blended, latest cycle) and GUU two-party split (PAC + execs, 3 cycles) → `data/validation/comparators.csv` — **validation only, not imported by the app** | human, ~3 h |
| B3 | Two reviewers independently accept/reject every fuzzy PAC and LDA-client match for the 40 firms → `data/validation/match-review.csv` | 2 humans, ~1 h each |
| B4 | `npm run validate:political` computes Spearman ρ (PAC-r, exec-r, pooled-r × each comparator) and Cohen's κ on B3 | machine |

Pass: **ρ ≥ 0.7 on the PAC stream, κ ≥ 0.8**. Fail → fix `orgmatch.mjs` / `employer-aliases.json`,
re-run; do not scale until it passes.

### Phase D — position-coding κ experiment (the decisive test, ~3 days elapsed)

| # | Step | Owner |
|---|---|---|
| D1 | One-page codebook `docs/codebook-lobbying-position.md`: *protection-seeking* (tariff imposition/extension, quota, domestic-content / Buy-American, entry licensing, exclusive contracts, subsidy or credit for own sector) / *market-opening* (tariff reduction, input exclusions, open procurement, interoperability, removal of licensing barriers) / *neutral or unclear* | machine draft, human edit |
| D2 | Extract the 40 firms' TAR/TRD/TAX/BUD/LBR/CPT filings, dedupe specific-issue text → `data/validation/position-sample.jsonl`; tiny local rating page (no network) that writes one file per rater | machine |
| D3 | Two raters label independently; script computes κ and a confusion table | 2 humans, ~2 h each |
| D4 | Decision recorded in ASSUMPTIONS.md: **κ ≥ 0.7 → Phase F**; **κ < 0.7 → ship P1–P4 only, axis named "protection-seeking activity"** | — |

### Phase E — behavioural sub-scores P2–P4 (machine-only, ~3 days)

| # | Sub-score | Source / rule | Ship? |
|---|---|---|---|
| E1 | **P4 federal-contract dependence** = contract obligations (last 3 FY) ÷ SEC revenue | USAspending bulk by recipient parent (UEI/DUNS); name match via `orgmatch.mjs`, every match stored with method | yes (public domain) |
| E2 | **P2 tariff-exclusion seeking** = # and $ of Section 232/301 exclusion requests | QuantGov datasets; name match | yes (public) |
| E3 | **P3 subsidy receipt** = assistance awards ÷ revenue | USAspending assistance (public). Good Jobs First only for offline cross-checks (ToS) | yes / GJF never bundled |
| E4 | Directional sanity checks: import-exposed industries should show higher P1/P2; concentrated industries more LBR/CPT | script report in `docs/political-seed.md` | — |

Each sub-score ships with `{value, denominator, asOf, source, verifyUrl}` and Unknown when unmatched;
the UI never collapses them into one number without showing the parts.

### Phase F — scale and classify (conditional on D; ~1 week)

| # | Step |
|---|---|
| F1 | LLM-assisted position labels for all ~12k+ filings' specific-issue text using the D1 codebook; human review of a stratified ≥ 200-item sample; report κ(model, humans) alongside κ(human, human) |
| F2 | `positionScore` per company (protection-seeking share of position-coded lobbying $) exported with confidence; app shows topic + position + behaviour side by side |
| F3 | Extend the political universe from 342 → full held set (~500 → all fund holdings); rerun A/C/E; refresh `political-facts.json` / `political-pack.json` / fund `leanExposure` |
| F4 | Maintenance cadence: FEC + LDA quarterly (`npm run seed:political`), USAspending annually, AV daily budget as now |

## Cross-cutting rules (apply in every phase)

- Aggregates only: no individual contributor rows or contact details in the DB exports or the app
  (test asserts the export contains no `name`/`address` fields under political data).
- Orientation-neutral display (Aligned / Mixed / Opposed / Unknown); never party colours; Axis 2
  labelled by what it measures ("activity" vs "position").
- Provenance badge + verify link on every figure (fec.gov, lda.gov filing document, usaspending.gov).
- Unknown is a first-class state, never hidden or redistributed.
- Local-first: seeding is an offline maintainer step; the app makes no network calls.
- Comparators (OpenSecrets, GUU, LobbyView, Good Jobs First) live under `data/validation/` and are
  never imported by `src/`.

## Effort and dependencies

| Phase | Machine time | Human time | Depends on |
|---|---|---|---|
| A | ~1 day (+ FEC 2020 download) | — | — |
| C | ~1 day | — | LDA crawl finished for the universe |
| B | ~½ day | ~5 h (1 recorder + 2 reviewers) | A |
| D | ~½ day | ~5 h (codebook edit + 2 raters) | C |
| E | ~3 days | — | C |
| F | ~1 week | ~1 day review | D pass |

## Risks

| Risk | Mitigation |
|---|---|
| Employee stream ρ is low (employer-string noise, ~70% attribution ceiling) | Report PAC and employee separately; publish coverage; don't gate on employee ρ |
| κ < 0.7 on position coding | Pre-decided fallback (topic + behaviour only, honest label) — no wasted classifier build |
| Name matching for USAspending / QuantGov repeats the FEC false-positive class | Reuse `orgmatch.mjs` deny/allow lists; store method per match; sample-audit 40 firms |
| Negative (blocking) lobbying leaves no footprint | Say so in the UI; behavioural sub-scores partly compensate |
| Comparator licences | Hand-recorded, validation-only, outside `src/` |
