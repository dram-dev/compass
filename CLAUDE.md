# Compass — values-aligned spend & investment planner

## What this repo is
A greenfield build. The complete specification is **docs/BUILD-PROMPT.md** — read it end to end before
writing anything. Two working single-file demos in **reference/** are the design and interaction ground
truth (visual tokens, dial, sankey lens toggles, pointer-based dual-range control, wizard step 4). They
are conceptual, throwaway code: extract patterns and data from them; do not extend them.

## Session start (every fresh session)
1. Read docs/BUILD-PROMPT.md fully.
2. Read reference/compass-demo.html and reference/compass-wizard.html; extract the `:root` design tokens
   and the Jordan dataset (8 categories with current/target allocations, 5 investment sleeves) for fixtures.
3. If PLAN.md does not exist: produce PLAN.md + ASSUMPTIONS.md per spec §0, then begin Phase P0.
4. If PLAN.md exists: read it, ASSUMPTIONS.md, and `git log`, then resume at the current phase gate.

## Non-negotiables (condensed from the spec — the spec wins on detail)
- Phase gates P0–P5 (§13); `npm run build`, `test`, `lint` clean at every gate; commit per gate as `P<n>: <summary>`.
- Engine ground truth (§6.5): Jordan under Local-first → current index **42.0**, optimal **58.9**; the
  groceries swap alone is **+5.2** overall and the category test values must match exactly. The reference
  demos compute these same numbers — parity with them is your sanity check.
- Data integrity §10 overrides everything: never fabricate real-company political figures; provenance
  badges everywhere; sample data links out (OpenSecrets / FEC / Goods Unite Us); Unknown is never hidden
  or redistributed.
- Dual-range sliders: Pointer Events implementation per the reference wizard. Paired native range inputs
  are forbidden (Android/Firefox touch failure).
- Sankey carries BOTH controls: asset lens (Spending / Investments) × state (Current / Optimal).
- Political display is orientation-neutral (Aligned / Mixed / Opposed / Unknown) — never party colors.
- Local-first privacy: no backend, no network calls for user data; versioned localStorage; JSON export/import.
- Persistent disclaimers: educational scenario tool, not financial advice; investments recommendations by
  vehicle class only.

## Stack (fixed — §4)
Vite + React 18 + TypeScript strict · Tailwind · Recharts + thin d3-sankey wrapper · Zustand · Vitest
(engine coverage ≥ 90%).

## Working style
- Autonomous: do not ask questions; log every judgment call, cut, or rename in ASSUMPTIONS.md.
- Low rework is the success metric. Boring, correct, well-typed code wins.
- Definition of done is §14, including the README traceability table mapping R1–R9 and extended
  features 1–9 to implementing files.
