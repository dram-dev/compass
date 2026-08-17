# Two political axes for companies — methodology research (2026-08-17)

Deep-research run: 5 search angles, 26 sources fetched, 128 claims extracted, 25 adversarially
verified (3 votes each; 0 refuted), synthesized to 10 findings. Everything under **Verified** survived
3-of-3 or 2-of-3 votes; **Sourced, not yet verified** items were fetched and quoted but fell outside
the verification budget — treat them as leads to confirm, not settled facts.

## Verdict

**Axis 1 (Democratic ↔ Republican lean of a company's political money)** has a mature, reproducible
recipe in the peer-reviewed literature and in practitioner methods, and it is essentially what Compass
already computes: share of D+R dollars, per two-year cycle, from FEC bulk data, with the **corporate
PAC** and **executive/employee** streams kept separate because they behave as different signals.
The academic benchmark for corporate PACs is 47.4% Republican with an IQR of 21–72% — most firms are
close to balanced, so "Mixed" will be the modal answer and that is correct, not a defect.

**Axis 2 (protection / rent-seeking ↔ open market)** has **no published, validated firm-level score**.
What exists is (a) firm-level lobbying data with issue codes and bill links (Senate LDA; LobbyView),
(b) event datasets that are unambiguous instances of protection-seeking (Section 232/301 tariff
exclusion requests, subsidies, bailouts, federal contracts), and (c) academic evidence that lobbying
— not PAC giving — is where allocative demands (tariffs, subsidies, tax carve-outs) show up. A
defensible Axis 2 therefore has to be **built as a composite of transparent sub-scores** and
validated with a hand-coded sample; the design below does that.

## Axis 1 — verified findings

| # | Finding | Confidence | Sources |
|---|---|---|---|
| 1 | OpenSecrets org leans blend PAC + employees **and family** + direct org money to outside groups; subsidiaries roll up only for cycles the parent owned them; ~70% of itemized individual $ get an employer code; a "three-legged stool" rule governs when an ideological code overrides the employer code. Their D/R % excludes nonpartisan money from the denominator. | high (3-0) | opensecrets.org/orgs/methodology; /industries/methodology; Comcast profile; IFS critique (2023) |
| 2 | Goods Unite Us uses the last **3 cycles**, **PAC + senior executives (VP→board) only**, excludes rank-and-file ("executives sign off on the PAC"); shows a two-party split, a 5-level volume tier, and a PAC-vs-exec breakdown; publishes **no formula or thresholds** ("super-secret algorithm"). Useful as a comparator, not reproducible. | high (3-0) | goodsuniteus.com FAQ; Medium 2018; BuzzFeed CEO interview 2025 |
| 3 | FEC INDIV bulk file: only itemized > $200 (cycle-to-date for candidates, year-to-date for PACs/parties); **MEMO_CD='X'** rows are earmark/conduit/JFC pass-throughs that double count if summed naively; EMPLOYER/OCCUPATION are 38-char free text with no identifier. | high (3-0) | fec.gov file description; FEC conduit guidance; IRE "Mining FEC data" |
| 4 | **Law**: 52 U.S.C. §30111(a)(4) / 11 CFR 104.15 bar commercial use of individual contributor data, but FEC AOs **2014-07 (Crowdpac), 2015-12 (Ethiq), 2017-08 (Point Bridge — a company index from aggregated data), 2022-10** permit commercial display of aggregated, non-identifying data. Never surface individual donor rows. AOs bind requestors; AO 2021-05 shows aggregation isn't a blanket safe harbor. | high (3-0) | fec.gov "sale or use"; AO PDFs; eCFR |
| 5 | Bonica CFscores/DIME: correspondence-analysis ideal points, r = 0.92 with DW-NOMINATE — but corporate/trade PACs are **excluded from estimation** (an access-seeking "investor" model fits them as well as ideology) and only projected; use CFscores to score *recipients*, then dollar-weight per firm stream, not DIME's projected PAC scores. | high (3-0, 3-0, 3-0, 2-1) | Bonica AJPS 2014; DIME v4 codebook (Dec 2024); Tausanovitch & Warshaw 2017 |
| 6 | DIME v4.0 (850M+ contributions, cleaned employer/occupation, entity-resolved donor IDs) is **ODC-BY** — usable commercially with attribution; the ~27M CRP/NIMSP state records are excluded and academic-only (CC BY-NC-SA). Federal records suffice for a US listed-company lean. | high (3-0) | data.stanford.edu/dime; codebook; ODC-BY |
| 7 | **PAC vs executives are different signals**: >¾ of corporate-elite dollars come from strong partisans vs 2–3% for PACs; PACs track majority control ("investor" behavior); aggregating executives to the firm level moderates toward the PAC-like distribution ("bipartisan boardrooms"). Show both streams separately. | high (3-0) | Bonica, Business & Politics 2016; Steel APSR 2025; Fos–Kempf–Tsoutsoura NBER 2022; Cohen et al. 2019 |
| 8 | Benchmark: corporate PAC % Republican of D+R per cycle — mean **47.4%**, IQR **21.1–72.2%**, 10th/90th pct 0%/100% (2,456 PAC-holding public firms, 21,782 firm-cycles, 1980–2018; recipients limited to House-race winners). | high (3-0) | Bertrand–Bombardini–Fisman–Trebbi–Yegen, RES 2025 (NBER w30876) |
| 9 | Reproducible linkage recipes: PAC names — strip legal suffixes, Levenshtein ≥ 70%, **manually check every fuzzy match**; only 2,456 of 28,284 CRSP firms have a PAC (absent PAC = true zero, since FEC is the universe). Employees — exact + 3 fuzzy passes at threshold 79 + ML confirm + RA review; executives flagged by occupation keywords (Founder/Chairman/President/Chief/CEO/CFO…) = 23–31% of donors; Bonica matched 83% of Fortune 500 CEOs/directors to DIME. | high (3-0) | BBFTY fn.12, App. A.7; Bonica 2016 p.375; Dataverse doi:10.7910/DVN/6R1HAS |
| 10 | Synthesized PoC design (medium — assembled from the above): two streams reported separately, 3-cycle pooling, executive sub-tier, volume/confidence tier + Unknown state; validate on 30–50 firms against OpenSecrets (blended) and GUU (PAC+exec) plus the BBFTY distribution; measure inter-rater agreement on manual match verification. | medium (synthesis) | as above |

## Axis 2 — sourced leads (not yet verified)

| Lead | What it gives you | Reproducible / license | Source |
|---|---|---|---|
| **Senate LDA REST API + bulk XML** (lda.gov/api/v1; senate.gov database download) | Quarterly filings: registrant, client, $, lobbyists, **79 general issue codes**, free-text specific issues, bill numbers, agencies. Codes that matter for Axis 2: **TAR** (miscellaneous tariff bills — separate from **TRD** trade), **TAX**, **BUD** (appropriations), **GOV**, **DEF**, **CPT** (IP), **SMB**. Gaps: antitrust is bundled into **LBR** with labor/workplace; there is **no procurement or subsidy code** — those need specific-issue text or bill references. | Public domain; anonymous API 15/min, free key ~120/min; deprecation header points to lda.gov (sunset of lda.senate.gov 2026-06-30) | lda.senate.gov/api/tos; API constants endpoint (79 codes) |
| **LobbyView** (Kim, MIT) | Every LDA filing parsed to firm level, linked to lobbyists, bills, agencies, issue codes, and matched to Compustat gvkeys — the canonical academic firm-level lobbying dataset. In 2017 only 766 of 7,646 US public firms lobbied; 92% persistence year to year. | **Personal, non-commercial viewing only** — cannot ship in the app; rebuild from LDA bulk instead | web.mit.edu/insong/www/pdf/lobbyview.pdf; lobbyview.org/policies |
| **Bombardini & Trebbi, "Empirical Models of Lobbying" (Ann. Rev. Econ. 2020)** | Lobbying ($3–3.5B/yr) dwarfs PAC giving ($200–250M/yr) and targets allocative policy (tariffs, subsidies, banking regulation, tax); pitfalls: misspelled client names need homogenization; in-house share fell from ~60% to <40% (1999–2008); much rent-seeking is **negative** (blocking) and leaves no legislative footprint. | Review article | annualreviews.org (NBER w26287) |
| **Bombardini, Cutinelli-Rendina & Trebbi, "Lobbying Behind the Frontier"** | Firms facing import competition shift toward rent-seeking via lobbying, especially laggards — an operational LDA-based detector of protectionist lobbying responses. | SSRN | ssrn 3928669 |
| **de Figueiredo & Richter (NBER w19698)** | Survey of empirical lobbying research: who lobbies, LDA measurement issues (in-house vs retained totals, issue-code ambiguity, thresholds). | Survey | nber.org/papers/w19698 |
| **"Testing Political Antitrust" (NYU L. Rev. 98:4)** | Links concentration to lobbying using refined LDA data; argues broad issue codes are insufficient — position-coded or bill-specific data are needed for an anti-competitive lobbying measure. | Article | nyulawreview.org |
| **Tariff exclusion requests** — Chor et al. "Exclusions for Sale?" (Yale, 2025); Section 232 steel exclusions (JIBP 2023, 163,522 requests); **QuantGov** downloadable 232/301 datasets | Firm-level requests for tariff exemptions merged with lobbying/contributions — an unambiguous protection-seeking event dataset. | Public datasets (QuantGov) | economics.yale.edu CGL_May2025.pdf; quantgov.org/tariffs |
| **Good Jobs First Subsidy Tracker** | State/local/federal subsidies since FY2000; federal keyed to CFDA codes (joinable to USAspending); adds TARP, Fed facilities, tax-credit allocations, loan guarantees. Some records rest on unpublished FOIA data. | **ToS: internal use only, no bulk redistribution/scraping** — offline scoring only, or a separate agreement | subsidytracker.goodjobsfirst.org data-sources page; ToS rev. 2024-08-27 |
| **USAspending** | Federal contract and assistance awards by recipient (UEI/DUNS/parent), public domain — enables a "federal contract dependence" metric when divided by SEC-reported revenue. | Public domain bulk + API | usaspending.gov |
| **regulations.gov comments** | Bertrand–Bombardini–Fisman–Hackinen–Trebbi (2019) mined comments across 150 agencies with NLP to measure firm positions — an alternative primary source for position coding. | Public | via Ann. Rev. Econ. review |
| **OpenSecrets bulk data** | Industry codes, org crosswalks, lobbying homogenization | **CC BY-NC-SA** — validation only, not for the app; API discontinued 2025-04-15 | opensecrets.org/open-data/terms-of-service |

## Proof-of-concept design

### Axis 1 — confirm, don't rebuild

Compass's pipeline already matches the verified recipe: FEC bulk PAC + employee streams, conduit rows
excluded, JFC/leadership-PAC party inferred, own-PAC inflows separated, no individual donor rows
stored, `r = (R−D)/(R+D)`. Three adjustments the research argues for:

1. **Report the two streams as two numbers**, not one pooled r. Keep the pooled lean for the app's
   single `leanScore`, but expose PAC-r and employee-r (and an executive sub-tier) in facts and
   sourceHint — this is exactly where OpenSecrets and GUU differ, and users should see it.
2. **Executive sub-tier** from OCCUPATION keywords (Founder / Chairman / President / Chief / CEO / CFO
   / General Partner / Managing Partner) — cheap, and it makes a GUU-comparable "PAC + executives"
   figure available alongside "all employees".
3. **Pool three cycles** (2020, 2022, 2024) rather than two, per GUU's anti-gaming rationale and
   Bonica's finding that elites are stable across cycles while PACs swing with majority control.

**Validation (small sample → scale):** pick 40 firms stratified by sector and PAC/no-PAC (10 sample
brands, 30 top-held). For each, record OpenSecrets org D/R % (blended, latest cycle) and GUU's
two-party split (PAC+exec, 3 cycles) by hand; compute Spearman ρ between our PAC-r / exec-r /
pooled-r and each comparator; expect ρ higher for the PAC stream (near-complete FEC coverage) than
for employees (employer-string noise; ~70% attribution). Check our PAC distribution against the
BBFTY benchmark (mean ≈ 47% R, IQR 21–72). Have two people independently review every fuzzy PAC and
LDA-client match for the 40 firms and report Cohen's κ; ≥ 0.8 clears the matcher for the 500-company
scale (already computed for 342). Passing criteria: ρ ≥ 0.7 on the PAC stream and κ ≥ 0.8.

### Axis 2 — build a composite of transparent sub-scores

No source offers a validated pro/anti-competition score, so define **five sub-scores from primary
data, each with its own provenance, and never collapse them without showing the parts**:

| Sub-score | Metric (per company, last 3 years) | Source | Status in Compass |
|---|---|---|---|
| **P1 Trade-protection lobbying** | share of lobbying $ (in-house-first per period rule) on filings whose issue codes include TAR or TRD; count of TAR/TRD filings | LDA (already seeded: filings + issue codes) | computable today |
| **P2 Tariff-exclusion seeking** | number and $ of Section 232/301 exclusion requests filed by the company (or subsidiaries) | QuantGov datasets; USTR/BIS dockets | new import |
| **P3 Subsidy receipt** | subsidy $ / revenue (SEC XBRL revenue already seeded) | Subsidy Tracker (offline only, ToS) or USAspending assistance awards | new import |
| **P4 Federal contract dependence** | federal contract obligations / revenue | USAspending (public domain) | new import |
| **P5 Regulatory-barrier lobbying** | share of lobbying $ on CPT (IP) + LBR filings **whose specific-issue text mentions antitrust/competition/merger/licensing/certification** — code required because LBR bundles labor and antitrust | LDA specific-issue text (already seeded per filing) | text step needed |

**Position, not just topic.** Codes say *what* a company lobbied on, not *which way*. The PoC's core
experiment: two raters independently label the specific-issue text of the 40 firms' TAR/TRD/TAX/BUD/
LBR/CPT filings as *protection-seeking* / *market-opening* / *neutral or unclear* using a one-page
codebook (tariff imposition or extension, quota, domestic-content or Buy-American, entry licensing,
exclusive contracts, subsidy or credit for own sector = protection; tariff reduction, exclusion for
inputs, open procurement, interoperability, removal of licensing barriers = market-opening). Report κ.
If κ ≥ 0.7, train a classifier (LLM-assisted, human-reviewed sample) on those labels and apply it to
the ~10k filings already in the DB; if κ < 0.7, ship only P1–P4 (topic and behavior, which need no
position judgment) and label the axis honestly as "protection-seeking activity", not "anti-market".

**External checks:** the import-competition → lobbying result (Bombardini–Cutinelli-Rendina–Trebbi)
predicts higher P1/P2 for firms in import-exposed industries — a directional sanity check; the NYU
"political antitrust" work predicts more LBR/CPT lobbying with concentration.

## Pitfalls and how they're handled

| Pitfall | Evidence | Handling |
|---|---|---|
| Conduit / JFC double counting (ActBlue, WinRed, victory funds) | FEC file description; IRE; Maryland Matters | Skip MEMO_CD='X' rows; keep the recipient's own 15E rows; infer JFC party from transfers (Compass does all three) |
| Employer strings are free text; ~70% attribution at best | FEC; OpenSecrets; BBFTY App. A.7 | Exact-normalized match against a curated alias table + audit of near-misses; report coverage; never prefix-match single words |
| PAC + employees blended silently | OpenSecrets vs GUU vs STAT News critique | Report streams separately; executive sub-tier |
| Corporate PACs are "investors", not ideologues | Bonica 2014/2016; BBFTY benchmark | Expect Mixed; show D/R split and volume, not just a label |
| In-house vs retained lobbying totals double count | OpenSecrets lobbying methodology; Bombardini–Trebbi | Per period: in-house expenses when filed, else sum firm income (Compass does this) |
| Misspelled LDA client names | Bombardini–Trebbi | Name-root search + exact/prefix matching with deny-list; every match stored with method |
| Issue codes are broad; antitrust hidden in LBR; no procurement/subsidy code | LDA constants; NYU L. Rev. | Text coding for position; USAspending/Subsidy Tracker for behavior |
| Negative lobbying (blocking) leaves no footprint | Bombardini–Trebbi | Say so in the UI; P2–P4 (behavior) partly compensate |

## Legal and terms-of-use summary

| Source | Status for a consumer app |
|---|---|
| FEC bulk data | Public; **aggregate only** — no individual contributor rows or contact details (52 U.S.C. §30111(a)(4); AOs 2014-07, 2015-12, 2017-08, 2022-10). Compass stores per-company aggregates and employer *names*, never donors. |
| Senate LDA | Public domain (statutory disclosure); API terms permit use; move to lda.gov endpoints. |
| DIME | ODC-BY (attribution) for public files; CRP/NIMSP records academic-only. |
| OpenSecrets bulk | CC BY-NC-SA — validation/reference only. |
| Goods Unite Us | Proprietary, no API/scraping — comparator by hand only. |
| LobbyView | Personal non-commercial viewing — do not ship; rebuild from LDA. |
| Good Jobs First | Internal use, no redistribution — offline scoring or agreement. |
| USAspending, QuantGov, regulations.gov | Public. |

## Open questions carried forward

1. Whether any group has published a validated pro-/anti-competitive coding of lobbying positions
   (none found in verified sources) — the PoC's κ experiment answers this for our own codebook.
2. Exact treatment of leadership PACs, JFCs and party committees in the PAC denominator across
   methods (BBFTY: House winners only; OpenSecrets: includes outside groups).
3. GUU's and OpenSecrets' current commercial terms for anything beyond hand comparison.

## Sources (fetched; verified claims cite the ones in the tables above)

opensecrets.org/orgs/methodology · opensecrets.org/industries/methodology · opensecrets.org/federal-lobbying/methodology · opensecrets.org/open-data/terms-of-service · goodsuniteus.com/where-do-we-get-our-data · fec.gov/campaign-finance-data/contributions-individuals-file-description · fec.gov/updates/sale-or-use-contributor-information · fec.gov/regulations/104-15 · fec.gov/files/legal/aos/2014-07 · web.stanford.edu/~bonica/papers/bonica_ajps_mimp_2014.pdf · data.stanford.edu/dime · Bonica, Business & Politics 2016 (Cambridge) · ftrebbi.com/research/bbfty.pdf · Political Science Research & Methods "Political alignment between firms and employees" · Warner, Political Behavior 2023 (Springer) · web.mit.edu/insong/www/pdf/lobbyview.pdf · lobbyview.org/data-download · lobbyview.org/policies · nber.org/papers/w19698 · annualreviews.org (Bombardini & Trebbi 2020) · ssrn 3928669 · nyulawreview.org "Testing Political Antitrust" · lda.senate.gov/api/tos · LDA issue-code constants · economics.yale.edu CGL_May2025.pdf · subsidytracker.goodjobsfirst.org data-sources · marylandmatters.org 2023-06-20 · statnews.com 2025-02-03
