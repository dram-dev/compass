import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  classifyExposure,
  COMPANY_BY_SYMBOL,
  FUND_BY_SYMBOL,
  FUND_CONCENTRATION,
  fundsHolding,
  hasFundData,
  type FundNode,
} from '@/data/fundConcentration';
import { useCompassStore } from '@/store/useCompassStore';
import { fmtMoneyK } from '@/lib/format';

const pct = (w: number, d = 1) => `${(w * 100).toFixed(d)}%`;
const money = (n: number | null) =>
  n === null || n === undefined
    ? '—'
    : n >= 1e12
      ? `$${(n / 1e12).toFixed(2)}T`
      : n >= 1e9
        ? `$${(n / 1e9).toFixed(1)}B`
        : fmtMoneyK(n);

/** Fund assets by political class of the companies held, relative to the user's preference (§6.4). */
function ExposureBar({ fund }: { fund: FundNode }) {
  const political = useCompassStore((s) => s.political);
  const e = fund.leanExposure;
  if (!e) return null;
  const configured = political.configured && political.direction !== 0;
  const c = classifyExposure(e, configured ? political.direction : 0);
  const total = c.aligned + c.mixed + c.opposed + c.unknown + c.nonCompany || 1;
  const seg = (v: number, bg: string, title: string) => (
    <span
      key={title}
      className="h-full"
      title={`${title} ${pct(v / total)}`}
      style={{ width: `${(v / total) * 100}%`, background: bg }}
    />
  );
  return (
    <div className="mt-2 text-[12px]">
      <div className="flex flex-wrap items-baseline gap-2 text-faint">
        <span>
          Political exposure of this fund's assets{configured ? ' (relative to you)' : ''}
        </span>
        {!configured && (
          <Link to="/wizard/3" className="underline-offset-2 hover:underline">
            configure your preference to classify →
          </Link>
        )}
      </div>
      <div
        className="mt-1 flex h-3.5 overflow-hidden rounded-sm border border-rule"
        role="img"
        aria-label={`Aligned ${pct(c.aligned / total)}, Mixed ${pct(c.mixed / total)}, Opposed ${pct(c.opposed / total)}, Unknown ${pct(c.unknown / total)}, non-company assets ${pct(c.nonCompany / total)}`}
      >
        {seg(c.aligned, 'var(--aligned)', 'Aligned')}
        {seg(c.mixed, 'var(--mixed)', 'Mixed')}
        {seg(c.opposed, 'var(--opposed)', 'Opposed')}
        {seg(c.unknown, 'var(--unknown)', 'Unknown')}
        {seg(c.nonCompany, 'var(--rule)', 'Governments, cash & other non-company assets')}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-faint">
        <span>Aligned {pct(c.aligned / total)}</span>
        <span>Mixed {pct(c.mixed / total)}</span>
        <span>Opposed {pct(c.opposed / total)}</span>
        <span>Unknown {pct(c.unknown / total)}</span>
        <span>gov/cash/other {pct(c.nonCompany / total)}</span>
      </div>
      <p className="mt-1 text-[11px] text-faint">
        Company leans come from FEC PAC + employee giving and Senate LDA lobbying (Data → Political
        money facts). Unknown = held companies without enough public data, plus positions beyond the
        top 250 stored per fund — never guessed.
      </p>
    </div>
  );
}

/**
 * Fund look-through: which companies the top-N most-held funds concentrate in (research DB export).
 * Data comes from scripts/seed → src/data/generated/fund-concentration.json; nothing is fetched at runtime.
 */
export function FundLookthroughPanel() {
  const [q, setQ] = useState('');
  const g = FUND_CONCENTRATION;
  const query = q.trim().toUpperCase();
  const fund = query ? FUND_BY_SYMBOL[query] : undefined;
  const company = query && !fund ? COMPANY_BY_SYMBOL[query] : undefined;
  const holders = useMemo(
    () => (company ? fundsHolding(company.symbol).slice(0, 15) : []),
    [company],
  );
  const top = g.companies.slice(0, 25);

  if (!hasFundData()) {
    return (
      <div className="mt-4 rounded border border-dashed border-rule px-5 py-6 text-[13px] text-faint">
        <b className="text-ink">Not seeded yet.</b> Run{' '}
        <code className="font-mono">npm run seed</code> with an Alpha Vantage key (and an SEC
        User-Agent for mutual funds) to build the research database and export the
        fund-concentration graph. See <code className="font-mono">docs/research-db.md</code>. The
        app never fetches this at runtime.
      </div>
    );
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-3 text-[12.5px] text-faint">
        <span>
          Generated {g.generatedAt?.slice(0, 10)} · {g.counts.fundsInGraph} funds ·{' '}
          {g.counts.companiesInGraph} companies · {g.counts.edges} edges
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="fund or company ticker (VOO, AAPL)…"
          aria-label="Look up a fund or company ticker"
          className="ml-auto w-[260px] rounded-full border border-dashed border-rule bg-transparent px-3 py-1 font-mono text-[11.5px] focus:border-brass focus:outline-none"
        />
      </div>
      {fund && (
        <div className="card mt-3 px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-2">
            <b>{fund.symbol}</b> <span>{fund.name}</span>
            <span className="chip">{fund.kind}</span>
            <span className="chip">rank #{fund.rank}</span>
            <span className="chip">net assets {money(fund.netAssets)}</span>
            {fund.proxyOf && (
              <span className="chip border-brass text-brass">holdings ≈ {fund.proxyOf}</span>
            )}
            <span className="ml-auto font-mono text-[11px] text-faint">
              {fund.holdingsSource} · as of {fund.asOf ?? '?'}
            </span>
          </div>
          <ExposureBar fund={fund} />
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {fund.topHoldings.map((h, i) => (
              <li
                key={`${h.symbol}-${i}`}
                className="flex justify-between gap-2 border-b border-rule py-1 font-mono text-[11.5px]"
              >
                <span>
                  {i + 1}. {h.symbol ?? '—'} <span className="text-faint">{h.name}</span>
                </span>
                <span>{pct(h.weight, 2)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {company && (
        <div className="card mt-3 px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-2">
            <b>{company.symbol}</b> <span>{company.name}</span>
            {company.sector && <span className="chip">{company.sector}</span>}
            <span className="chip">
              held by {company.fundsHolding} of the top {g.topN}
            </span>
            <span className="chip">
              max {pct(company.maxWeight)} in {company.maxWeightFund}
            </span>
            <span className="chip">≈ {money(company.aumWeightedUsd)} of fund assets</span>
            {company.shareOfMarketCap !== null && (
              <span className="chip">≈ {pct(company.shareOfMarketCap)} of market cap</span>
            )}
            {company.lean !== undefined && (
              <span className="chip">
                FEC lean{' '}
                {company.lean === null
                  ? 'not assigned'
                  : `${company.lean > 0 ? '+' : ''}${company.lean}`}
              </span>
            )}
          </div>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {holders.map(({ fund: f, weight }) => (
              <li
                key={f.symbol}
                className="flex justify-between gap-2 border-b border-rule py-1 font-mono text-[11.5px]"
              >
                <span>
                  {f.symbol} <span className="text-faint">{f.name}</span>
                </span>
                <span>{pct(weight, 2)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {query && !fund && !company && (
        <p className="mt-2 text-[12.5px] text-faint">
          No fund or company “{query}” in the seeded graph.
        </p>
      )}
      <div className="card mt-3 overflow-x-auto">
        <div className="border-b border-rule px-4 py-2.5 text-[11px] uppercase tracking-[.12em] text-faint">
          Highest concentration across the top {g.topN} funds (AUM-weighted)
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[.1em] text-faint">
              <th className="px-4 py-2 font-normal">Company</th>
              <th className="px-2 py-2 font-normal">Sector</th>
              <th className="px-2 py-2 text-right font-normal">Funds</th>
              <th className="px-2 py-2 text-right font-normal">Max weight</th>
              <th className="px-2 py-2 font-normal">in</th>
              <th className="px-2 py-2 text-right font-normal">FEC lean</th>
              <th className="px-4 py-2 text-right font-normal">Fund $ pointed at it</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c) => (
              <tr key={c.symbol} className="border-t border-rule">
                <td className="px-4 py-1.5">
                  <button
                    type="button"
                    className="font-mono underline-offset-2 hover:underline"
                    onClick={() => setQ(c.symbol)}
                  >
                    {c.symbol}
                  </button>{' '}
                  <span className="text-faint">{c.name}</span>
                </td>
                <td className="px-2 py-1.5 text-faint">{c.sector ?? '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{c.fundsHolding}</td>
                <td className="px-2 py-1.5 text-right font-mono">{pct(c.maxWeight)}</td>
                <td className="px-2 py-1.5 font-mono">
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setQ(c.maxWeightFund)}
                  >
                    {c.maxWeightFund}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {c.lean === undefined
                    ? '—'
                    : c.lean === null
                      ? 'n/a'
                      : `${c.lean > 0 ? '+' : ''}${c.lean}`}
                </td>
                <td className="px-4 py-1.5 text-right font-mono">{money(c.aumWeightedUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-faint">
        Weights are as of each fund's latest report; “fund $ pointed at it” = Σ weight × fund net
        assets over the seeded universe (share-class duplicates counted once). Educational, not
        investment advice.
      </p>
    </div>
  );
}
