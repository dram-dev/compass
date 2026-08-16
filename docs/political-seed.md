# Political-money seed: method and provenance

`npm run seed:political` (`scripts/seed/seed-political.mjs`) derives, per listed company, an
orientation-neutral **political-support lean** from **public primary sources only**, records the
facts behind it, and exports (a) `src/data/generated/political-facts.json` for the Data page and
(b) `src/data/generated/political-pack.json`, a standard Compass data pack the user can load with
one click (records get `provenance: 'imported'` badges and verify links, exactly like any community
pack). Nothing here is fetched by the app at runtime.

## Sources

| Channel | Source | Files / endpoints | Notes |
|---|---|---|---|
| Company PAC → candidates & parties | FEC bulk data | `cm` (committee master, incl. `CONNECTED_ORG_NM`), `cn` (candidate master, party), `ccl` (candidate↔committee links), `pas2` (committee→candidate contributions), `oth` (committee→committee) | Per two-year cycle (default 2022, 2024). Transaction types 24K/24Z only (direct contributions; independent expenditures 24A/24E excluded); memo rows skipped; SUB_ID de-duplicated across `pas2`/`oth`. |
| Employees → candidates & parties | FEC bulk data | `indiv` (individual contributions, ~4 GB/cycle, streamed) | Rows whose `EMPLOYER` string equals (after normalization) a curated alias of the company. Types 15/15E/15J/10/11 counted, 22Y refunds subtracted, memo rows skipped, entity type IND only. |
| Lobbying | Senate LDA REST API (`lda.gov/api/v1`) | `clients/?client_name=` → `filings/?client_id=&filing_year=` | Quarterly reports Q1–Q4 (+ amendments; latest posting per registrant/client/period wins). Amount = `income` (hired firm) or `expenses` (in-house). **Per period, a company's own in-house expenses report already includes what it paid retained firms, so when one exists it is the number; otherwise the firms' income is summed** (`v_lobbying_period`; the same rule OpenSecrets uses — Apple 2023 reproduces its published $9.86M). Issue codes and agencies kept per filing. |

Company ↔ entity matching (`scripts/seed/orgmatch.mjs`, `data/employer-aliases.json`,
`data/political-overrides.json`) is deliberately conservative and fully auditable:

- Names are normalized (uppercase, `&`→AND, punctuation removed) and only **legal-form** suffixes are
  stripped (Inc/Corp/Co/LLC/Ltd/PLC…). Words like *Group / Holdings / International / America* stay.
- **exact**: normalized string equals an alias. **prefix**: string starts with a *multi-word* alias
  ("BANK OF AMERICA MERRILL LYNCH"), unless the next word is on a deny-list (BOTTLING, CONSOLIDATED,
  ASSOCIATION, CREDIT, UNION, FOUNDATION, DEALERS…). Single-word aliases prefix-match only against
  corporate PAC *names* and only when followed by a legal-form / PAC word ("MICROSOFT CORPORATION …"
  yes; "META FINANCIAL …" no).
- Committees: only non-candidate, non-party committees; labor/membership/trade/coop org types excluded;
  matched via `CONNECTED_ORG_NM` first, then the committee name (corporate org types only).
- Employers: **exact match only** (no prefix) — the noisy channel gets the strict rule.
- Every match is stored (`political_committee`, `lobbying_client`, `political_employer_match`) with its
  `match_method`; corrections go in `data/political-overrides.json` (force/exclude committee or client
  IDs, exclude employer strings) with a reason.
- Second share classes (`GOOG` → `GOOGL`) are declared with `sameAs` and inherit the canonical facts.

## Party attribution

Recipient party = the recipient committee's `CMTE_PTY_AFFILIATION` (DEM/DFL → D, REP → R, third
parties → O), else its linked candidate's party (`cn`/`ccl`), else the party **inferred from the
recipient's own behavior in the same cycle** — leadership PACs, party-aligned super PACs (CLF, SLF,
SMP, HMP…) and caucus PACs carry no party code and no candidate link in the bulk files, so a committee
is assigned D or R when ≥ $10k and ≥ 80% of its own contributions (24K/24Z) and independent expenditures
(24E for / 24A against, flipped) point one way (`inferPartiesFromRows`; ~2,000 committees per cycle) —
else **U** (genuinely non-party recipients: corporate/trade PACs, bipartisan groups). FEC codes
UNK/NNE/NON/NPA/blank all mean "no party", not "third party". Effect on 2024 corporate PAC dollars:
U fell from ~35% to ~4%.

## Lean (the only derived number)

```
r = (R − D) / (R + D)         over selected cycles, PAC + employee dollars (O and U excluded)
leanScore = −2 if r ≥ 0.6 · −1 if 0.2 ≤ r < 0.6 · 0 if |r| < 0.2 · +1 if −0.6 < r ≤ −0.2 · +2 if r ≤ −0.6
            null (Unknown) when R + D < $5,000
confidence = high if R + D ≥ $250k and both channels present · med if ≥ $25k · low otherwise
```

Sign convention (ASSUMPTIONS #17): negative = conservative/Republican-leaning giving, positive =
progressive/Democratic-leaning. The wizard asks which end is aligned with *you*; every display is
Aligned / Mixed / Opposed / Unknown in semantic colors. Most large corporate PACs give near 50/50 and
land in **Mixed** — that is the honest answer, not a defect. Companies with no PAC and no exact
employer matches stay **Unknown**; nothing is inferred.

Each exported record's `sourceHint` states the cycles, PAC and employee totals with D/R split,
lobbying totals and years, the lean with `r` and confidence, the computation date, this document,
and FEC committee links. Verify at fec.gov, lda.gov, and OpenSecrets before acting.

## Running

```bash
npm run seed:political                       # FEC (2022, 2024; PAC + employees) → LDA (2023–2025) → lean + exports
node scripts/seed/index.mjs political:fec --cycles 2024 --skip-employees   # quick PAC-only pass
node scripts/seed/index.mjs political:lda --only AMZN,WMT
node scripts/seed/index.mjs political:export
```

Downloads are cached under `db/cache/fec/<cycle>/` (`indiv` ≈ 4.2 GB per cycle) and `db/cache/lda/`.
The Senate API allows ~15 anonymous requests/minute; set `LDA_API_KEY` (free registration) for ~100/min.
Everything is resumable. Companies covered = research-DB companies ∪ shipped sample-brand tickers ∪
`data/employer-aliases.json` keys.

## What this deliberately does not do

- No state-level data (FollowTheMoney), no 527/501(c)(4) dark-money attribution, no trade-association
  membership inference — none of these are systematically disclosed at the company level. CPA-Zicklin
  disclosure scores could be added by hand as an override field.
- No scraping of aggregators (OpenSecrets, Goods Unite Us); they remain verify links.
- No values ratings: this stage writes only `PoliticalProfile` (lean, confidence, sourceHint).
