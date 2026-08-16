# ASSUMPTIONS — judgment calls, cuts, renames

Numbered, append-only. Each entry: decision · rationale · phase.

## Data integrity (§10)

1. **Sample dataset = fictional archetypes (fully rated) + real US brands (roll-up/sector/bucket only, unrated).**
   §10.1 asks for 40–60 widely known US brands with illustrative political profiles; CLAUDE.md forbids
   fabricating real-company political figures. Resolution: the fully-rated records (principle ratings and
   `leanScore` placeholders) are clearly fictional archetypes (NationalMart → Omnicorp Holdings, etc., as in
   the reference demos), while ~40 real brands ship with only public structural facts (parent company,
   sector, bucket default), `leanScore: null`, empty `ratings` (→ bucket defaults) and a `sourceHint`
   telling the user to verify at OpenSecrets / FEC / Goods Unite Us or import a community data pack.
   Jordan names archetype merchants so the political panel is demonstrable. Every record still carries
   `provenance: 'sample'` and a "Sample — verify" badge. (P1)
2. **Political-alignment principle rating is derived, not stored, for sample data.** For a company with a
   `leanScore` and a configured preference, `r_political = clamp(leanScore × direction × intensity, −2, 2)`;
   null lean or unconfigured → 0. Bucket defaults for the political principle are 0 (neutral — no bucket
   is assumed to lean anywhere). A user override in `ratings['political-alignment']` wins. The reference
   demo used non-zero bucket-default `po` ratings; that would presume a political lean for "local" vs
   "major" and is dropped for neutrality. Local-first ground truth is unaffected (po weight = 0). (P1)
3. **Unrated company (empty `ratings`) falls back to its bucket's default ratings** so naming a merchant
   never silently zeroes a bucket; the UI prompts to rate it. (P1)

## Engine

4. **Uncertainty band** = min/max of the index evaluated at (a) all range-mins renormalized and (b) all
   range-maxes renormalized, widened to include the headline midpoint value. Spec §6.3 wording followed
   literally; a full box-constrained min/max is out of scope for v1. (P1)
5. **Swap candidates**: for each category, pair the largest bucket *decrease* with the largest bucket
   *increase* first (full gap), then the next-largest pairs, cap 3, drop |Δ| < 0.05 index points.
   `deltaIndexPoints` is the overall-index gain of applying that swap alone (matches §6.5 "+9.6"). (P1)
6. **Heuristics table** (`engine/heuristics.ts`): keyed by category archetype (matched by default id or
   by label keyword) and by shift size; documented in README. Unknown categories → effort 2, cost
   'small'. (P1)
7. **Investments scoring** reuses `alignment()`; holdings map to sleeves by `type` (cash→Cash & deposits,
   fund→Retirement funds, equity→Individual equities, other→Community notes if user flags `community`,
   else Alternatives; crypto→Alternatives/crypto). Investment buckets for the sankey are derived from each
   holding's alignment: a ≥ 0.4 Community-aligned; −0.4 < a < 0.4 Broad-market/mixed; a ≤ −0.4
   Major-corp concentrated; unrated → Unknown/unrated. Thresholds logged here, editable in code only. (P1)

## Stack / architecture

8. **Routing = `react-router-dom` HashRouter** (`#/`, `#/dashboard`, `#/plan`, `#/data`). Spec says
   "/plan route"; hash routing keeps deep links working on static hosts (GitHub Pages) with no server
   config. (P0)
9. **Tailwind v3.4 (pinned)** rather than v4: mature config-file token mapping, fewer moving parts. (P0)
10. **Fonts (Fontsource):** display serif = *Source Serif 4* (humanist, close to the reference's Iowan Old
    Style/Palatino stack), UI = *Inter* (grotesk, `tnum` supported), numerals/mono = system
    `ui-monospace` stack (as in the reference). (P0)
11. **Charts:** dial, sankey and slope/dumbbell are custom SVG React components mirroring the reference
    demos (§11 says their dial construction and chart idioms are canonical; Recharts has no dumbbell or
    the reference dial). Recharts is used for pareto scatter, trajectory line, political stacked bars and
    principles radar. All SVG → print-safe. (P3)
12. **Drag between gates:** native HTML5 drag-and-drop plus keyboard "Move to…" menu on each action card
    for accessibility; no DnD library. (P4)
13. **Number tick-up** implemented with `requestAnimationFrame` easing; disabled under
    `prefers-reduced-motion`. (P3)
14. **Store**: single Zustand store with `persist` middleware, key `compass.v1`, `version` = schema
    version; `store/migrations.ts` holds a no-op v1 migration and the switch scaffold. (P0/P2)

## Cuts / deferrals

15. **CSV transaction import (EF10)**: shipped as a disabled "Coming soon" affordance in Step 4 unless
    time remains at P5. (P5)
16. Per-merchant spend shares within a bucket: equal weights (spec allows for v1). (P1)

## Added during P1

17. **Political axis convention (sample data + step 3 copy).** `leanScore` sign: negative = donation
    profile leaning conservative/Republican, positive = leaning progressive/Democratic (coarse, low
    confidence). Step 3 names both ends so the user can pick which is "aligned"; every downstream
    display is Aligned / Mixed / Opposed / Unknown in semantic colors only. Only fictional archetypes
    carry a non-null lean in sample data (see #1). (P1)
18. **Unrated → per-principle fallback** (refines #3): `r_i = company.ratings[i] ?? bucketDefault[bucket][i]`,
    so a company rated on two principles uses bucket defaults for the rest rather than silent zeros. (P1)
19. **Ranges around presets are symmetric** (`midpointsToRanges` and the Jordan fixture): half-width
    shrinks near 0/100 so renormalized midpoints stay exact — needed for the 58.9 parity (a clamped
    `[0,7]` band would move a 2% midpoint to 3.5%). (P1)
20. **Goal-mode switch semantics:** switching mode always re-applies that preset's principle weights
    (custom principles keep their weight; unlisted library principles → 0; `custom` leaves weights
    alone). Target presets are re-applied only while `wizard.targetsCustomized` is false or via an
    explicit "Reset targets to preset" action — a dashboard toggle never overwrites hand-set targets. (P1)
21. **Investments "optimal"** = per-holding user-editable `targetBucket` (default from
    `suggestedTargetBucket`); projected alignment uses a representative a per bucket
    (community +0.8 / mixed 0 / major −0.8 / unknown 0) when the holding changes bucket. (P1)
22. **Real-brand parent facts** in the sample set are limited to widely reported ownership (e.g.,
    Whole Foods → Amazon; Trader Joe's → Aldi Nord; Hulu → Disney). Ace Hardware is bucketed
    `regional` (retailer-owned cooperative) though individual stores are locally owned — user-editable. (P1)
