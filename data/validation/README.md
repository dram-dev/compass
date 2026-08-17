# data/validation — the human-in-the-loop steps (Phases B and D)

Everything in this folder is **validation-only**. Comparator numbers from OpenSecrets (CC BY-NC-SA) and
Goods Unite Us (proprietary) are hand-recorded here for correlation checks and are never imported by
`src/` or shipped. Regenerate the machine parts any time with
`node scripts/seed/validate-political.mjs sample|review-template|position-sample` — hand-entered
columns are preserved on regeneration.

| File | Made by | Human step |
|---|---|---|
| `political-sample.json` | `sample` | — (40 firms: 10 sample brands, 30 top-held across sectors, 11 without a PAC) |
| `comparators.csv` | `sample` | **B2 (~3 h, one person)** — for each row open `opensecrets_url`, pick the org profile, record its Dem % / Rep % (latest cycle) and the cycle; then search the company on goodsuniteus.com and record its two-party split (PAC + executives, 3 cycles). Leave blank if not found; add a note. |
| `match-review.csv` | `review-template` | **B3 (~1 h each, two people, independently)** — rows are sorted fuzzy-first. For every `fuzzy=yes` row decide `accept` / `reject`: is this committee / LDA client really the company (or a subsidiary of it)? Exact rows are an optional spot check. Fill `reviewer1` and `reviewer2` in separate passes without looking at each other's column. |
| `docs/political-validation.md` | `validate` | read the ρ / κ result; pass = ρ ≥ 0.7 on the PAC stream, κ ≥ 0.8 |
| `position-sample.jsonl` | `position-sample` | — (≈190 lobbying activities from the 40 firms' TAR/TRD/TAX/BUD/LBR/CPT filings, deduped, interleaved) |
| `rate-positions.html` | — | **D3 (~2 h each, two raters, independently)** — open the file in a browser (double-click), enter your name, load `position-sample.jsonl`, read `docs/codebook-lobbying-position.md` once, then label each item with keys 1/2/3. Progress is saved in the browser; click Export to write `ratings-<name>.jsonl` and put it in this folder. |
| `ratings-*.jsonl` | raters | drop here, then `node scripts/seed/validate-political.mjs position-kappa` |

Decision rules (docs/PLAN-political-axes.md): B passes → the matcher is cleared for the full universe;
D: κ ≥ 0.7 → Phase F (classifier with human review); κ < 0.7 → ship P1–P4 only and name the axis
"protection-seeking activity". Rejected matches go into `data/political-overrides.json` with a reason.
