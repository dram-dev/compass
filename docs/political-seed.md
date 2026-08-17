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
| Company PAC → candidates & parties | FEC bulk data | `cm` (committee master, incl. `CONNECTED_ORG_NM`), `cn` (candidate master, party), `ccl` (candidate↔committee links), `pas2` (committee→candidate contributions), `oth` (committee→committee) | Per two-year cycle (default **2020, 2022, 2024** — three cycles pooled: elites are stable across cycles while PACs swing with majority control, and pooling blunts single-cycle gaming). Transaction types 24K/24Z only (direct contributions; independent expenditures 24A/24E excluded); memo rows skipped; SUB_ID de-duplicated across `pas2`/`oth`. |
| Employees → candidates & parties | FEC bulk data | `indiv` (individual contributions, 4–6 GB/cycle, streamed) | Rows whose `EMPLOYER` string equals (after normalization) a curated alias of the company — this includes executives and founders, which is how FEC employer data works. Types 15/15E/15J/10/11 counted, 22Y refunds subtracted, memo rows skipped, entity type IND only. Conduit pass-through rows (24T/24I, ActBlue/WinRed) are excluded; the recipient's own 15E row carries the party. Contributions to the **company's own PAC** are split out as channel `pac-inflow` (already represented by the PAC's outgoing gifts). |
| Senior executives (subset of employees) | same `indiv` rows | `OCCUPATION` free text | Channel `executive` = the employee rows whose stated occupation is a senior-executive title (below). Not additive — the pooled lean still uses PAC + employees; the executive stream is reported alongside so a Goods-Unite-Us-style "PAC + executives" figure exists next to "all employees". |
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

### Executive tier (`isExecutiveOccupation`, `scripts/seed/fec.mjs`)

Deliberately narrow; false negatives are cheaper than counting a bank's thousands of VPs as executives.

- **in**: C-suite (CEO/CFO/COO/CTO/CIO/CMO/CRO/CLO/CPO/CHRO/CISO/CDO/CSO/CAO, "CHIEF … OFFICER",
  "CHIEF EXECUTIVE"), PRESIDENT (including divisional), CHAIRMAN/CHAIRWOMAN/CHAIRPERSON/CHAIR,
  FOUNDER/CO-FOUNDER, GENERAL/MANAGING PARTNER, MANAGING DIRECTOR, EXECUTIVE/SENIOR VICE PRESIDENT
  (EVP/SVP), BOARD MEMBER / BOARD OF DIRECTORS.
- **out**: plain VICE PRESIDENT / VP / AVP, DIRECTOR, PRINCIPAL, OWNER (franchisees), anything
  ASSISTANT/DEPUTY/ASSOCIATE/SECRETARY-to, RETIRED/FORMER, "chief" trades (chief engineer, chief pilot,
  chief of staff), ACCOUNT/SALES EXECUTIVE.

The literature flags executives by similar keyword lists (BBFTY App. A.7: Founder/Chairman/President/
Chief/CEO/CFO… ≈ 23–31% of donors); Goods Unite Us goes down to VP. We stop above VP and say so.

## Party attribution

Recipient party = the recipient committee's `CMTE_PTY_AFFILIATION` (DEM/DFL → D, REP → R, third
parties → O), else its linked candidate's party (`cn`/`ccl`), else the party **inferred from the
recipient's own behavior in the same cycle** — leadership PACs, party-aligned super PACs (CLF, SLF,
SMP, HMP…) and caucus PACs carry no party code and no candidate link in the bulk files, so a committee
is assigned D or R when ≥ $10k and ≥ 80% of its own contributions (24K/24Z), transfers to affiliated
committees (24G — how joint fundraising committees distribute) and independent expenditures (24E for /
24A against, flipped) point one way; the rule iterates to a fixed point so a committee that funds an
already-inferred committee (Senate Majority PAC → its spending arm) resolves too (`inferCommitteeParties`;
~3,000 committees per cycle) — else **U** (genuinely non-party recipients: bipartisan groups, other
corporate/trade PACs). FEC codes UNK/NNE/NON/NPA/blank all mean "no party", not "third party".
Result on 2022+2024 dollars: PAC channel 2% U, employee channel 3% U.

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

**Streams are also reported separately.** Corporate PACs and executives are different signals — more
than three-quarters of corporate-elite dollars come from strong partisans versus 2–3% for PACs, which
follow majority control (docs/research-political-axes.md, findings 2, 3, 7) — so each fact record
carries `streams.pac`, `streams.employee` and `streams.executive`, each with its own `r` and
`leanScore` (same bins and $5k floor, no confidence tier). This is exactly where OpenSecrets (blended)
and Goods Unite Us (PAC + executives) diverge; users see both. The pooled `lean` above remains the
single number the engine consumes.

Each exported record's `sourceHint` states the cycles, PAC, employee and executive totals with D/R
split, lobbying totals and years, the lean with `r` and confidence, the computation date, this document,
and FEC committee links. Verify at fec.gov, lda.gov, and OpenSecrets before acting.

### Distribution check (`npm run validate:political`)

`scripts/seed/validate-political.mjs benchmark` prints each stream's Republican share of two-party
dollars across the covered companies against the published corporate-PAC benchmark (Bertrand,
Bombardini, Fisman, Trebbi & Yegen, RES 2025: mean 47.4% R, IQR 21–72%, 1980–2018) and writes
`docs/political-benchmark.md` with `--write`. Most corporate PACs give near 50/50, so a wide IQR
centred a little under 50% is the expected shape; a mean far off centre or a near-uniform IQR means the
matcher or the party resolver is broken (`--strict` exits 1). Our universe — the largest, most-held
firms — is narrower than the benchmark by construction; that is a warning, not a failure, and the
40-firm hand check (docs/PLAN-political-axes.md, Phase B) is the real test.

## Lobbying topics and P1 (Axis-2 inputs — activity, not position)

There is no validated published pro-/anti-competition score for companies (docs/research-political-axes.md),
so the protection ↔ open-market axis is built from transparent sub-scores. This stage ships the two that
the LDA data already supports (`scripts/seed/lobbying-topics.mjs`, table `lobbying_filing_topic`,
export block `protectionActivity`):

- **Topic flags per filing.** `kind='code'`: the filing's LDA general issue codes that matter here
  (TAR miscellaneous tariff bills, TRD trade, TAX, BUD, GOV, DEF, CPT, LBR — antitrust is filed under
  LBR with labor, SMB). `kind='keyword'` (`method='keyword-v1'`): literal regex hits over the free-text
  "specific lobbying issues" for tariff, tariff-exclusion, domestic-content (Buy American, Jones Act…),
  antitrust/merger, licensing-certification, subsidy/tax-credit, procurement, trade-agreement — each
  with a ≤ 200-char evidence snippet from the public filing. **A flag says the filing touched a subject,
  never which way the company argued**; the position question is the Phase-D κ experiment.
- **P1 trade-protection lobbying share.** Per period, the share of *reported* filing dollars (retained
  firms' income + in-house expenses) on filings whose codes include TAR/TRD, applied to the period's
  de-duplicated total (in-house-first rule) so P1 dollars never exceed the lobbying total shown
  elsewhere. Two attributions: **any-code** (a filing counts fully if any code is TAR/TRD — an upper
  bound, dominated by big in-house filings that list twenty codes) and **issue-weighted** (filing $ ×
  TAR/TRD codes ÷ distinct codes on the filing — the discriminating number; the UI leads with it).
  When a period has only "< $5,000" filings (amount 0) the share falls back to filing counts.
- Companies with no matched LDA client stay **Unknown** for this block (`protectionActivity: null`).

## Running

## Running

```bash
npm run seed:political                       # FEC (2020, 2022, 2024; PAC + employees + executive tier) → LDA (2023–2025) → topics, lean + exports
node scripts/seed/index.mjs political:fec --cycles 2024 --skip-employees   # quick PAC-only pass
node scripts/seed/index.mjs political:lda --only AMZN,WMT
node scripts/seed/index.mjs political:export  # rebuilds lobbying_filing_topic, computes streams + P1, writes both exports
npm run validate:political -- --write        # stream distributions vs the published benchmark → docs/political-benchmark.md
```

Downloads are cached under `db/cache/fec/<cycle>/` (`indiv` ≈ 4.2–5.9 GB per cycle) and `db/cache/lda/`.
The Senate API allows ~15 anonymous requests/minute; set `LDA_API_KEY` (free registration) for ~100/min.
Everything is resumable. Companies covered = research-DB companies ∪ shipped sample-brand tickers ∪
`data/employer-aliases.json` keys.

## What this deliberately does not do

- No state-level data (FollowTheMoney), no 527/501(c)(4) dark-money attribution, no trade-association
  membership inference — none of these are systematically disclosed at the company level. CPA-Zicklin
  disclosure scores could be added by hand as an override field.
- No scraping of aggregators (OpenSecrets, Goods Unite Us); they remain verify links.
- No values ratings: this stage writes only `PoliticalProfile` (lean, confidence, sourceHint).
