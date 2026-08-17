# Research database: company financials + fund concentration graph

An **offline** SQLite database (`db/compass.sqlite`, git-ignored) seeded by `scripts/seed/`, plus a
JSON export the app reads at build time (`src/data/generated/fund-concentration.json`). The app itself
still makes **no network calls** — seeding is a developer/maintainer step.

## What it holds

| Table / view | Contents | Source |
|---|---|---|
| `company` | One row per ticker: name, **SIC industry + broad sector**, exchange, CIK, shares outstanding, public float (SEC); market cap, P/E, margins, ROE, EPS, 52-week range, raw OVERVIEW JSON (Alpha Vantage). Upserts merge (non-null wins), `source` records which sources contributed | SEC `submissions` + XBRL `companyfacts` (primary, no key); Alpha Vantage `OVERVIEW` (enrichment, 25/day free) |
| `financial_period` | Annual + quarterly periods: revenue, gross/operating/net income, EBITDA (operating income + D&A), assets/liabilities/equity, cash, LT debt, operating cash flow, capex, dividends, free cash flow (derived). SEC values pick the latest-filed fact per period end (restatements win) with duration sanity checks; concept fallback chains documented in `sec-xbrl.mjs` | SEC XBRL `companyfacts` (us-gaap); Alpha Vantage statements when budget allows |
| `fund` | Ticker, name, kind (etf/mutual), family, category, net assets, expense ratio, holdings source/as-of, proxy, SEC ids, **popularity_rank** | SEC N-PORT for every '40-Act fund incl. most ETFs (latest filing per series via EDGAR full-text search); Alpha Vantage `ETF_PROFILE` when budget allows (adds expense ratio / yield); grantor trusts (SPY, GLD…) only via Alpha Vantage |
| `fund_holding` | Raw graph edges: fund → holding (ticker, name, CUSIP/ISIN, weight fraction, $ value, as-of, **asset & issuer category**, how the ticker was resolved). Non-US tickers are suffixed with country (`ENR.DE`) because filings use local exchange symbols; share classes normalized (BRK-B) | same |
| `fund_holding_effective` | Holdings after one level of **fund-of-funds look-through** (a target-date fund's position in "Vanguard Total Stock Market Index Fund" expands into that fund's holdings × weight); what the concentration views and the graph read | derived |
| `v_company_concentration` | Per company (corporate equity/preferred/debt only — no governments, cash, or unresolved funds): #funds holding it, max weight (+ which fund), avg weight, **AUM-weighted $** (Σ weight × fund net assets; share-class duplicates excluded) | derived |
| `v_fund_lookthrough` | Fund → holding → company context (sector, market cap, $ exposure) | derived |
| `fetch_log` | Every request outcome (ok/cached/throttled/empty/error) | — |

Schema: `db/schema.sql`. Regenerate the candidate universe with `npm run universe`
(`scripts/seed/gen-universe.mjs` → `data/fund-universe.json`, ~300 tickers).

### Ticker resolution and its limits

Filings often list only CUSIP/ISIN. After seeding, `backfillHoldingSymbols` fills missing tickers from
other filings that carry both (same CUSIP → same ISIN → same normalized issuer name; unambiguous keys
only) and records the method per row. Positions still unresolved (mostly bonds and small non-US names)
stay out of the company graph rather than being guessed. Each fund keeps its top 250 positions; the
remainder is reported as "beyond top-250" (Unknown) in look-through displays, never redistributed.

## Setup

```bash
cp .env.example .env            # add ALPHAVANTAGE_API_KEY and SEC_USER_AGENT
npm run seed:funds              # ETF profiles + mutual-fund N-PORT holdings, then popularity rank
npm run seed:companies          # OVERVIEW for the queue (sample-brand tickers first, then holdings by concentration)
npm run seed:graph              # views → src/data/generated/fund-concentration.json (the app reads this)
npm run seed                    # all of the above; npm run seed:status for counts
```

Options: `node scripts/seed/index.mjs companies --overview 500 --statements 100 --only AAPL,MSFT`,
`funds --limit 40 --only SPY,VOO`, any command with `--offline` (cache only).

## Rate limits and resumability

- Every HTTP response is cached under `db/cache/` (keyed without the API key). Re-runs are free;
  a throttled run stops cleanly and **resumes where it left off** the next time.
- Alpha Vantage free keys allow ~25 requests/day (the seeder paces at `AV_REQUESTS_PER_MINUTE`, default 5).
  A full first pass is ~165 ETF profiles + ~300 company overviews + 3 statements × the top 50 companies
  ≈ 600 calls — a few minutes on a premium key, ~3½ weeks of daily runs on a free key. Prioritization
  makes partial runs useful: sample-brand tickers and the most-concentrated holdings come first.
- SEC EDGAR: no key, but a descriptive `SEC_USER_AGENT` is required (their fair-access policy);
  the seeder stays under 4 requests/second.

## "Top 200 most popular" — how the ranking works

`data/fund-universe.json` is a curated candidate list (~163 ETFs, ~137 mutual funds). After fetching,
funds are ranked by **net assets** and `popularity_rank ≤ 200` defines the graph. Index mutual funds
that are a **share class of an ETF** (e.g., VFIAX ↔ VOO) get `proxy_of` and inherit the ETF's rank so
the same pool of assets isn't counted twice; same-index funds from other families (FXAIX vs IVV) are
separate assets and count on their own. Active mutual funds get holdings from their latest N-PORT
filing; if SEC isn't configured, index funds fall back to their proxy ETF's holdings and active
funds are skipped (visible in `fetch_log`).

## Fund-level political look-through

`funds[].leanExposure` buckets each fund's assets by the FEC/LDA-derived lean (−2…+2) of the companies
held (`docs/political-seed.md`), plus `unknown` (companies without enough public data), `nonCompany`
(governments, cash, unresolved funds) and `coverage` (share of assets in the stored top-250). The app
classifies these **relative to the user's own preference** (Aligned / Mixed / Opposed / Unknown; §6.4)
and shows "beyond top-250" as Unknown. `companies[].lean` carries the same lean for the concentration table.

## Reading the graph

`src/data/generated/fund-concentration.json` (schema `compass-fund-concentration` v1):
`funds[]` (top-N nodes with their top-25 holdings), `companies[]` (up to 500, sorted by
AUM-weighted concentration, with `fundsHolding`, `maxWeight`, `maxWeightFund`, `aumWeightedUsd`,
`shareOfMarketCap` when market cap is known), and `edges[]` (fund → company weights ≥ 0.5%).
The Data page ("Fund look-through") renders it; `src/data/fundConcentration.ts` exposes helpers.

## Integrity notes

- Holding weights are as reported by each fund's latest snapshot; AUM-weighted dollars are
  approximations for ranking concentration, not audited figures.
- No political data is touched by this pipeline; company financials are facts from filings via the
  provider. Everything shown in the app cites its source (`sources` block in the export).
- Educational scenario tool — not investment advice.
