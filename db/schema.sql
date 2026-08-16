-- Compass research database (SQLite). Seeded offline by scripts/seed; never read by the app at
-- runtime (the app stays local-first — it consumes the exported JSON in src/data/generated/).
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- companies + financials
CREATE TABLE IF NOT EXISTS company (
  symbol           TEXT PRIMARY KEY,           -- exchange ticker, uppercase
  name             TEXT NOT NULL,
  asset_type       TEXT,                       -- 'Common Stock' | 'ETF' | ...
  exchange         TEXT,
  currency         TEXT,
  country          TEXT,
  sector           TEXT,
  industry         TEXT,
  description      TEXT,
  cik              TEXT,
  fiscal_year_end  TEXT,
  market_cap       REAL,                       -- USD
  ebitda           REAL,
  pe_ratio         REAL,
  peg_ratio        REAL,
  book_value       REAL,
  dividend_yield   REAL,
  eps              REAL,
  revenue_ttm      REAL,
  gross_profit_ttm REAL,
  profit_margin    REAL,
  operating_margin_ttm REAL,
  roa_ttm          REAL,
  roe_ttm          REAL,
  beta             REAL,
  week52_high      REAL,
  week52_low       REAL,
  shares_outstanding REAL,
  overview_json    TEXT,                       -- raw OVERVIEW payload (provenance)
  source           TEXT NOT NULL DEFAULT 'alphavantage',
  fetched_at       TEXT NOT NULL               -- ISO timestamp
);

-- One row per company × statement × period; normalized key metrics + raw JSON for everything else.
CREATE TABLE IF NOT EXISTS financial_period (
  symbol             TEXT NOT NULL REFERENCES company(symbol) ON DELETE CASCADE,
  period_type        TEXT NOT NULL CHECK (period_type IN ('annual','quarterly')),
  fiscal_date_ending TEXT NOT NULL,            -- YYYY-MM-DD
  reported_currency  TEXT,
  -- income statement
  total_revenue      REAL,
  gross_profit       REAL,
  operating_income   REAL,
  net_income         REAL,
  ebitda             REAL,
  -- balance sheet
  total_assets       REAL,
  total_liabilities  REAL,
  shareholder_equity REAL,
  cash_and_equivalents REAL,
  long_term_debt     REAL,
  -- cash flow
  operating_cashflow REAL,
  capital_expenditures REAL,
  dividend_payout    REAL,
  free_cashflow      REAL,                     -- operating_cashflow - capex (derived)
  income_json        TEXT,
  balance_json       TEXT,
  cashflow_json      TEXT,
  fetched_at         TEXT NOT NULL,
  PRIMARY KEY (symbol, period_type, fiscal_date_ending)
);

-- ---------------------------------------------------------------- funds + holdings (the graph)
CREATE TABLE IF NOT EXISTS fund (
  symbol          TEXT PRIMARY KEY,            -- ticker (ETF or mutual fund share class)
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('etf','mutual')),
  family          TEXT,                        -- issuer, e.g. Vanguard
  category        TEXT,                        -- free text from the universe list
  net_assets      REAL,                        -- USD
  expense_ratio   REAL,
  dividend_yield  REAL,
  inception_date  TEXT,
  holdings_source TEXT,                        -- 'alphavantage:ETF_PROFILE' | 'sec:NPORT-P' | 'proxy:<symbol>' | 'none'
  holdings_as_of  TEXT,                        -- report date of the holdings snapshot
  proxy_of        TEXT,                        -- when holdings are approximated by another fund's
  sec_cik         TEXT,
  sec_series_id   TEXT,
  sec_class_id    TEXT,
  popularity_rank INTEGER,                     -- 1..N by net assets among the seeded universe
  raw_json        TEXT,
  fetched_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fund_holding (
  fund_symbol     TEXT NOT NULL REFERENCES fund(symbol) ON DELETE CASCADE,
  holding_symbol  TEXT,                        -- normalized ticker when resolvable (may be NULL)
  holding_name    TEXT NOT NULL,
  cusip           TEXT,
  isin            TEXT,
  weight          REAL NOT NULL,               -- fraction of fund (0..1)
  value_usd       REAL,
  as_of           TEXT,
  source          TEXT NOT NULL,
  PRIMARY KEY (fund_symbol, holding_name, cusip)
);
CREATE INDEX IF NOT EXISTS idx_fund_holding_symbol ON fund_holding(holding_symbol);

-- ---------------------------------------------------------------- bookkeeping
CREATE TABLE IF NOT EXISTS fetch_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,                   -- 'alphavantage' | 'sec'
  endpoint    TEXT NOT NULL,
  key         TEXT NOT NULL,                   -- symbol or url
  status      TEXT NOT NULL,                   -- 'ok' | 'cached' | 'throttled' | 'empty' | 'error'
  detail      TEXT,
  at          TEXT NOT NULL
);

-- ---------------------------------------------------------------- derived views
-- Company-level concentration across the seeded fund universe.
CREATE VIEW IF NOT EXISTS v_company_concentration AS
SELECT
  h.holding_symbol                                   AS symbol,
  MAX(h.holding_name)                                AS name,
  COUNT(DISTINCT h.fund_symbol)                      AS funds_holding,
  MAX(h.weight)                                      AS max_weight,
  AVG(h.weight)                                      AS avg_weight,
  SUM(h.weight * COALESCE(f.net_assets, 0))          AS aum_weighted_usd,   -- $ of fund assets pointed at this company
  (SELECT h2.fund_symbol FROM fund_holding h2
     WHERE h2.holding_symbol = h.holding_symbol
     ORDER BY h2.weight DESC LIMIT 1)                AS max_weight_fund
FROM fund_holding h
JOIN fund f ON f.symbol = h.fund_symbol
WHERE h.holding_symbol IS NOT NULL
  AND f.proxy_of IS NULL                             -- avoid double counting proxy share classes
GROUP BY h.holding_symbol;

-- Fund-level look-through: top holdings per fund with company context.
CREATE VIEW IF NOT EXISTS v_fund_lookthrough AS
SELECT f.symbol AS fund_symbol, f.name AS fund_name, f.kind, f.net_assets, f.popularity_rank,
       h.holding_symbol, h.holding_name, h.weight, h.weight * COALESCE(f.net_assets,0) AS exposure_usd,
       c.sector, c.industry, c.market_cap
FROM fund f
JOIN fund_holding h ON h.fund_symbol = f.symbol
LEFT JOIN company c ON c.symbol = h.holding_symbol;
