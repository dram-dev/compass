import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Minimal .env loader (no dependency): KEY=value lines, # comments, no interpolation. */
function loadDotenv() {
  const p = path.join(root, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotenv();

export const CONFIG = {
  root,
  dbPath: process.env.COMPASS_DB ?? path.join(root, 'db', 'compass.sqlite'),
  schemaPath: path.join(root, 'db', 'schema.sql'),
  cacheDir: process.env.COMPASS_CACHE ?? path.join(root, 'db', 'cache'),
  universePath: path.join(root, 'data', 'fund-universe.json'),
  exportPath:
    process.env.COMPASS_EXPORT ??
    path.join(root, 'src', 'data', 'generated', 'fund-concentration.json'),
  alphaVantage: {
    key: process.env.ALPHAVANTAGE_API_KEY ?? '',
    base: 'https://www.alphavantage.co/query',
    // Free keys: ~25 requests/day (5/min historically). Premium: 75+/min. Tune via env.
    perMinute: Number(process.env.AV_REQUESTS_PER_MINUTE ?? 5),
    dailyBudget: Number(process.env.AV_DAILY_BUDGET ?? 25),
  },
  sec: {
    // SEC requires a descriptive User-Agent with contact info; keep ≤ 10 req/s (we do 4/s).
    userAgent: process.env.SEC_USER_AGENT ?? '',
    perSecond: 4,
    tickersUrl: 'https://www.sec.gov/files/company_tickers_mf.json',
  },
  topN: Number(process.env.COMPASS_TOP_FUNDS ?? 200),
  politicalTopHeld: Number(process.env.COMPASS_POLITICAL_TOP_HELD ?? 500),
  maxHoldingsPerFund: Number(process.env.COMPASS_MAX_HOLDINGS ?? 250),
};

export function requireAlphaVantageKey() {
  if (!CONFIG.alphaVantage.key) {
    throw new Error(
      'ALPHAVANTAGE_API_KEY is not set. Put it in .env (see .env.example) or export it in your shell.',
    );
  }
}
export function requireSecUserAgent() {
  if (!CONFIG.sec.userAgent) {
    throw new Error(
      'SEC_USER_AGENT is not set. The SEC requires a descriptive User-Agent, e.g. "Compass research you@example.com" (see .env.example).',
    );
  }
}
