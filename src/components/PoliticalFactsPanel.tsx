import { useMemo, useState } from 'react';
import {
  hasPoliticalFacts,
  POLITICAL_FACT_BY_TICKER,
  POLITICAL_FACTS,
  POLITICAL_PACK_JSON,
  POLITICAL_PACK_SIZE,
  POLITICAL_PACK_SOURCE,
  type PartySplit,
  type PoliticalFact,
} from '@/data/politicalFacts';
import { parseDataPack } from '@/data/dataPack';
import { useCompassStore } from '@/store/useCompassStore';

const money = (n: number) =>
  n >= 1e9
    ? `$${(n / 1e9).toFixed(1)}B`
    : n >= 1e6
      ? `$${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `$${(n / 1e3).toFixed(0)}k`
        : `$${Math.round(n)}`;
const pct = (a: number, t: number) => (t > 0 ? `${Math.round((a / t) * 100)}%` : '—');

/** Orientation-neutral bar: share of partisan dollars by class, plus non-partisan/other in grey. */
function SplitBar({ s, label }: { s: PartySplit; label: string }) {
  const total = s.D + s.R + s.O + s.U;
  if (total <= 0) return null;
  const seg = (v: number, color: string, title: string) => (
    <span
      title={`${title} ${pct(v, total)}`}
      style={{ width: `${(v / total) * 100}%`, background: color }}
      className="h-full"
    />
  );
  return (
    <div className="grid grid-cols-[110px_1fr_170px] items-center gap-2 text-[11.5px]">
      <span className="text-faint">{label}</span>
      <div
        className="flex h-3 overflow-hidden rounded-sm border border-rule"
        role="img"
        aria-label={`${label}: to Democrats ${pct(s.D, total)}, Republicans ${pct(s.R, total)}, third parties ${pct(s.O, total)}, non-party recipients ${pct(s.U, total)}`}
      >
        {seg(s.D, 'var(--mixed)', 'Democratic recipients')}
        {seg(s.R, 'var(--faint)', 'Republican recipients')}
        {seg(s.O, 'var(--brass)', 'Third-party recipients')}
        {seg(s.U, 'var(--unknown)', 'Non-party recipients (PACs, super PACs)')}
      </div>
      <span className="font-mono text-faint">
        {money(total)} · D {pct(s.D, s.D + s.R)} / R {pct(s.R, s.D + s.R)}
      </span>
    </div>
  );
}

export function PoliticalFactCard({ f }: { f: PoliticalFact }) {
  const lobY = Object.keys(f.lobbying).sort();
  return (
    <div className="card px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-2">
        <b>{f.symbol}</b> <span>{f.name}</span>
        {f.sameAs && <span className="chip">share class of {f.sameAs}</span>}
        <span className={`chip ${f.lean.leanScore === null ? '' : 'border-ink text-ink'}`}>
          lean{' '}
          {f.lean.leanScore === null
            ? 'not assigned'
            : `${f.lean.leanScore > 0 ? '+' : ''}${f.lean.leanScore}`}{' '}
          · {f.lean.confidence} confidence
        </span>
        <span className="chip">FEC cycles {f.lean.cycles.join(', ')}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        <SplitBar s={f.totals.pac} label="Company PAC" />
        <SplitBar s={f.totals.employee} label="Employees" />
        {f.totals.pac.D + f.totals.pac.R + f.totals.pac.O + f.totals.pac.U === 0 &&
          f.totals.employee.D + f.totals.employee.R + f.totals.employee.O + f.totals.employee.U ===
            0 && (
            <span className="text-[12px] text-faint">
              No FEC contributions matched (no corporate PAC and no exact employer matches).
            </span>
          )}
      </div>
      {lobY.length > 0 && (
        <div className="mt-2 text-[12px]">
          <span className="text-faint">Lobbying (Senate LDA): </span>
          {lobY.map((y) => (
            <span key={y} className="mr-3 font-mono">
              {y} {money(f.lobbying[y]!)}
            </span>
          ))}
          {f.topIssues.length > 0 && (
            <span className="text-faint">
              {' '}
              · issues:{' '}
              {f.topIssues
                .slice(0, 5)
                .map((i) => i.name)
                .join(', ')}
            </span>
          )}
        </div>
      )}
      <details className="mt-2 text-[11.5px] text-faint">
        <summary className="cursor-pointer hover:text-ink">
          How this was matched · verify links
        </summary>
        <div className="mt-1 grid gap-1">
          {f.committees.length > 0 && (
            <div>
              FEC committees:{' '}
              {f.committees.map((c) => `${c.id} ${c.name} (${c.method})`).join('; ')}
            </div>
          )}
          {f.clients.length > 0 && (
            <div>LDA clients: {f.clients.map((c) => `${c.name} (${c.method})`).join('; ')}</div>
          )}
          {f.employers.length > 0 && (
            <div>
              Top employer strings:{' '}
              {f.employers
                .slice(0, 6)
                .map((e) => `${e.employer} ${money(e.amount)}`)
                .join('; ')}
            </div>
          )}
          <div>{f.sourceHint}</div>
          <div className="flex flex-wrap gap-2">
            {f.links.fec.map((u) => (
              <a
                key={u}
                className="chip hover:border-ink hover:text-ink"
                href={u}
                target="_blank"
                rel="noopener noreferrer"
              >
                FEC ↗
              </a>
            ))}
            <a
              className="chip hover:border-ink hover:text-ink"
              href={f.links.opensecrets}
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenSecrets ↗
            </a>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * Political-money facts from public filings (FEC bulk + Senate LDA), computed offline by scripts/seed and
 * shipped as JSON. Nothing is fetched at runtime. Loading the bundled pack is a user action that goes through
 * the same validated data-pack import as any community pack (records get Imported badges + verify links).
 */
export function PoliticalFactsPanel() {
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const importCompanies = useCompassStore((s) => s.importCompanies);
  const imported = useCompassStore((s) => s.importedCompanies);
  const query = q.trim().toUpperCase();
  const fact = query ? POLITICAL_FACT_BY_TICKER[query] : undefined;
  const top = useMemo(
    () => POLITICAL_FACTS.companies.filter((c) => c.lean.leanScore !== null).slice(0, 12),
    [],
  );
  const alreadyLoaded = imported.some((c) => c.source === POLITICAL_PACK_SOURCE);

  if (!hasPoliticalFacts()) {
    return (
      <div className="mt-4 rounded border border-dashed border-rule px-5 py-6 text-[13px] text-faint">
        <b className="text-ink">Not seeded yet.</b> Run{' '}
        <code className="font-mono">npm run seed:political</code> — it downloads FEC bulk files
        (corporate PAC and employee contributions) and Senate LDA lobbying filings, derives a
        documented lean per company (<code className="font-mono">docs/political-seed.md</code>), and
        exports the facts plus a data pack here. No API key needed; the app never fetches at
        runtime.
      </div>
    );
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-faint">
        <span>
          Computed {POLITICAL_FACTS.generatedAt?.slice(0, 10)} · FEC cycles{' '}
          {POLITICAL_FACTS.cycles.join('/')} · {POLITICAL_FACTS.counts.companies} companies ·{' '}
          {POLITICAL_FACTS.counts.withLean} with a lean · {POLITICAL_FACTS.counts.withLobbying} with
          lobbying
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ticker (AMZN, WMT)…"
          aria-label="Look up political facts by ticker"
          className="ml-auto w-[200px] rounded-full border border-dashed border-rule bg-transparent px-3 py-1 font-mono text-[11.5px] focus:border-brass focus:outline-none"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn"
          disabled={POLITICAL_PACK_SIZE === 0 || alreadyLoaded}
          onClick={() => {
            const r = parseDataPack(POLITICAL_PACK_JSON);
            if (!r.ok) {
              setNotice(`Bundled pack rejected: ${r.error}`);
              return;
            }
            const n = importCompanies(r.companies, r.source);
            setNotice(
              `Loaded ${n} company records with Imported badges (${r.overridesSample} override sample brands). Political leans now flow into scoring when your preference is configured.`,
            );
          }}
        >
          {alreadyLoaded
            ? 'Bundled political pack loaded'
            : `Load bundled political-money pack (${POLITICAL_PACK_SIZE} records)`}
        </button>
        <span className="text-[11.5px] text-faint">
          Same import path as a community pack — your own ratings still win; you can clear it under
          Reset.
        </span>
      </div>
      {notice && (
        <div role="status" className="callout">
          {notice}
        </div>
      )}
      {fact && (
        <div className="mt-3">
          <PoliticalFactCard f={fact} />
        </div>
      )}
      {query && !fact && (
        <p className="mt-2 text-[12.5px] text-faint">
          No facts for “{query}”. Companies without a corporate PAC and without exact employer
          matches stay Unknown.
        </p>
      )}
      {!query && (
        <div className="mt-3 grid gap-2">
          {top.map((f) => (
            <PoliticalFactCard key={f.symbol} f={f} />
          ))}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-faint">
        Method: {POLITICAL_FACTS.method} Displays are relative to <em>your</em> stated preference
        elsewhere in the app; this panel shows the underlying public facts by recipient party, in
        neutral colors.
      </p>
    </div>
  );
}
