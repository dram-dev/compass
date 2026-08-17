# Political validation — 40-firm hand check (Phase B) and position coding (Phase D)

Generated 2026-08-17 by `node scripts/seed/validate-political.mjs validate` / `position-kappa`.

## B4 · Spearman ρ vs hand-recorded comparators

Recorded: OpenSecrets org 40/40 (3-cycle amounts 40; PAC-only committee pages 29) · Goods Unite Us 25/40 · **40 rows are machine-read drafts, not yet hand-verified**. Comparators are validation-only (CC BY-NC-SA / proprietary) and never shipped.

| Our stream (%R of D+R) | vs OpenSecrets PAC-only, 2020–24 (committee pages, to candidates) | vs OpenSecrets 2024 org (blended: PAC + individuals + org) | vs OpenSecrets 2020–24 org blended | vs GUU (PAC + senior execs, 3 cycles) |
|---|---|---|---|---|
| pac | ρ = 0.772 (n=29) | ρ = 0.689 (n=29) | ρ = 0.688 (n=29) | ρ = 0.697 (n=19) |
| exec | ρ = 0.693 (n=28) | ρ = 0.864 (n=38) | ρ = 0.875 (n=38) | ρ = 0.604 (n=24) |
| employee | ρ = 0.628 (n=29) | ρ = 0.834 (n=40) | ρ = 0.893 (n=40) | ρ = 0.669 (n=25) |
| pooled | ρ = 0.828 (n=29) | ρ = 0.93 (n=40) | ρ = 0.96 (n=40) | ρ = 0.736 (n=25) |

**Pass (ρ ≥ 0.7, our PAC stream vs the PAC-only comparator): yes (ρ = 0.772)**

## B3 · Match audit — Cohen's κ between two reviewers

Reviewed by both: 0/1290 rows. κ (all rows) = — (agreement —, n=0); κ (fuzzy rows only) = — (n=0).

**Pass (κ ≥ 0.8): not yet computable**

## D3 · Position coding — κ between raters

Items: 190 · raters:  · rated by all: 0.


**Decision rule (κ ≥ 0.7): not yet computable**
