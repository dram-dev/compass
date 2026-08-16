import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';

/** Token-bucket style limiter: at most `n` calls per `windowMs`, spaced evenly. */
export function makeLimiter(n, windowMs) {
  const gap = windowMs / Math.max(1, n);
  let last = 0;
  return async function wait() {
    const now = Date.now();
    const due = Math.max(now, last + gap);
    last = due;
    if (due > now) await new Promise((r) => setTimeout(r, due - now));
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cachePath(ns, key) {
  const h = createHash('sha1').update(key).digest('hex').slice(0, 16);
  const safe = key.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60);
  return path.join(CONFIG.cacheDir, ns, `${safe}.${h}.json`);
}

export function readCache(ns, key) {
  const p = cachePath(ns, key);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
export function writeCache(ns, key, body, meta = {}) {
  const p = cachePath(ns, key);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ cachedAt: new Date().toISOString(), meta, body }));
}

/**
 * GET with disk cache, retries and a caller-supplied limiter. Returns { body, cached }.
 * `parse` = 'json' | 'text'. `validate(body)` may throw to force a retry (e.g., AV throttle notes).
 */
export async function cachedGet(
  ns,
  url,
  { headers = {}, limiter, parse = 'json', validate, retries = 3, offline = false, cacheKey } = {},
) {
  const key = cacheKey ?? url;
  const hit = readCache(ns, key);
  if (hit) return { body: hit.body, cached: true, cachedAt: hit.cachedAt };
  if (offline) return { body: null, cached: false, offline: true };
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    attempt++;
    try {
      if (limiter) await limiter();
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const body = parse === 'json' ? await res.json() : await res.text();
      if (validate) validate(body);
      writeCache(ns, key, body, { url });
      return { body, cached: false };
    } catch (e) {
      lastErr = e;
      if (!(e instanceof RetryableError) || attempt > retries) break;
      await sleep(e.waitMs ?? 1500 * attempt);
    }
  }
  throw lastErr;
}

export class RetryableError extends Error {
  constructor(msg, waitMs) {
    super(msg);
    this.waitMs = waitMs;
  }
}
export class ThrottledError extends Error {}
