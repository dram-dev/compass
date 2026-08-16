# Compass — build package

Spec + reference demos for building a values-aligned spending & investment planner with Claude Code.

## Contents
- `CLAUDE.md` — session brief; Claude Code reads this automatically at start.
- `docs/BUILD-PROMPT.md` — the full build specification (requirements, engine formulas, phases, DoD).
- `reference/compass-demo.html` — working dashboard demo (dial, sankey with Spending/Investments ×
  Current/Optimal, slope, political exposure, tradeoffs, stage-gate plan).
- `reference/compass-wizard.html` — working wizard Step 4 demo (dual-range inputs, renormalized
  midpoints, merchant provenance, live index preview).

Both demos are fully self-contained — double-click to open in any browser, desktop or phone, offline.
They are conceptual references, not the app.

## Quick start
```bash
unzip compass-build-kit.zip && cd compass
git init && git add -A && git commit -m "seed: spec + reference demos"
claude
```
Then say: **"Read CLAUDE.md and begin."**
Claude Code will read the spec, write PLAN.md, and start Phase P0. Phase gates P0–P5 each end with a
passing build/test/lint and a commit, finishing with the §14 definition-of-done checklist.

## Notes
- All company/political data in the demos is illustrative, on fictional archetypes, with verify-links to
  OpenSecrets, FEC.gov, and Goods Unite Us. The real app must keep the same provenance discipline (spec §10).
- Educational scenario tool — not financial, investment, or tax advice.
