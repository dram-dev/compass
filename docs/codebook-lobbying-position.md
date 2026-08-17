# Codebook — lobbying position (protection-seeking / market-opening / neutral)

One page. Used by two independent raters on `data/validation/position-sample.jsonl` (Phase D of
`docs/PLAN-political-axes.md`). Rate the **text**, not the company: what does this lobbying activity, as
described in the filing, ask government to do? Company names are hidden by default in the rating page.

## The unit

One item = one lobbying activity from a Senate LDA quarterly filing: its general issue code (TAR, TRD, TAX,
BUD, LBR, CPT) and the registrant's free-text "specific lobbying issues". Filings often list several
unrelated matters in one text — code the **dominant** ask; if two asks pull in opposite directions with
equal weight, code `neutral` and note it.

## Labels

**`protection`** — the ask would shelter the filer (or its sector) from competition, or transfer public
money / privileges to it:
- tariffs, quotas, or trade remedies (anti-dumping, countervailing, Section 232/301) **imposed, kept or
  extended** on competing imports; opposing tariff *reductions* on competitors' goods
- domestic-content or Buy-American / Build-America / Berry-Amendment / Jones-Act requirements, or
  preferences for domestic producers in procurement
- entry barriers: licensing, certification, accreditation or standards that competitors would have to
  meet and the filer already meets; opposing new entrants' access (interoperability, spectrum, network,
  data-portability, right-to-repair when the filer is the incumbent)
- exclusive or sole-source contracts, set-asides that favour the filer's class, non-competitive renewals
- subsidies, grants, loan guarantees, tax credits or carve-outs **for the filer's own sector or product**
  (CHIPS, IRA production credits, specific depreciation or credit provisions), bailouts
- weakening antitrust or merger review that would apply to the filer; supporting a merger of its own

**`market-opening`** — the ask would lower barriers, widen access, or remove privileges (including the
filer's competitors' privileges — that still counts as market-opening):
- tariff reduction or removal, tariff **exclusions on inputs** the filer buys, opposing new tariffs,
  free-trade agreements, market access abroad, de minimis, GSP renewal
- open / competitive procurement, opposing set-asides and sole-source awards
- removing licensing or certification barriers, interoperability or portability **mandates**, right to
  repair (when the filer is the challenger)
- stronger antitrust enforcement against others; opposing a competitor's merger
- ending or sunsetting subsidies / tax preferences (including its own), broad-based rate changes that do
  not single out a sector

**`neutral`** — cannot be placed on the axis from the text alone:
- monitoring, "educating Congress", "issues related to …" with no ask stated
- general appropriations levels, agency funding, government operations, disaster relief
- tax items with no competitive angle (accounting method, filing rules, general rate debate without a
  sector carve-out), pension / retirement plan rules
- labor / workplace items in LBR (wages, benefits, immigration of workers) — not competition
- IP items in CPT that concern general patent or copyright procedure rather than a barrier
- mixed items with opposing asks of equal weight (say so in the note)

## Decision aids

- Ask: *if government did exactly this, would the filer face **less** competition or receive money it
  otherwise would not?* → protection. *More competition / fewer privileges (for anyone)?* → market-opening.
- A tariff is protection for the producer of the protected good and market-opening for the buyer of that
  good — code from the **filer's** side as described in the text; if the text does not say, `neutral`.
- "Support for the CHIPS Act" from a chipmaker = protection (own-sector subsidy); from a chip buyer
  seeking cheaper supply = neutral (no competitive angle stated).
- Vague trade language ("trade matters", "tariffs and trade policy") without a direction = `neutral`.
- Do not use outside knowledge of the company's known positions. Rate what is written.

## Output

`data/validation/ratings-<yourname>.jsonl`, one line per item: `{"id","label","note","rater","ratedAt"}`
— produced by `data/validation/rate-positions.html` (Export). Labels: `protection`, `market-opening`,
`neutral`. Then `node scripts/seed/validate-political.mjs position-kappa`.
