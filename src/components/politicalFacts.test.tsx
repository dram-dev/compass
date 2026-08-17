import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PoliticalFactCard, PoliticalFactsPanel } from './PoliticalFactsPanel';
import {
  hasPoliticalFacts,
  POLITICAL_FACTS,
  POLITICAL_PACK_SIZE,
  type PoliticalFact,
} from '@/data/politicalFacts';
import { parseDataPack } from '@/data/dataPack';
import { useViewStore } from '@/store/useViewMode';
import { POLITICAL_PACK_JSON } from '@/data/politicalFacts';

function sampleFact(): PoliticalFact {
  return {
    symbol: 'AMZN',
    name: 'Amazon',
    pac: {},
    employee: {},
    totals: {
      pac: { D: 500000, R: 500000, O: 0, U: 100000 },
      employee: { D: 900000, R: 100000, O: 0, U: 0 },
      executive: { D: 200000, R: 50000, O: 0, U: 0 },
    },
    streams: {
      pac: { D: 500000, R: 500000, O: 0, U: 100000, r: 0, leanScore: 0, partisanUsd: 1e6 },
      employee: { D: 900000, R: 100000, O: 0, U: 0, r: -0.8, leanScore: 2, partisanUsd: 1e6 },
      executive: {
        D: 200000,
        R: 50000,
        O: 0,
        U: 0,
        r: -0.6,
        leanScore: 2,
        partisanUsd: 250000,
        subsetOf: 'employee',
      },
    },
    lobbying: { 2024: 19_000_000 },
    topIssues: [{ name: 'Taxation', filings: 4 }],
    protectionActivity: {
      years: [2023, 2024],
      lobbyTotalUsd: 38_000_000,
      filings: 120,
      tradeProtection: {
        anyUsd: 30_000_000,
        weightedUsd: 3_800_000,
        anyShare: 0.79,
        weightedShare: 0.1,
        filings: 40,
        codes: { TRD: 40 },
      },
      topics: {
        TRD: { filings: 40, usdAny: 30_000_000, share: 0.79, kind: 'code' },
        antitrust: { filings: 12, usdAny: 9_000_000, share: 0.24, kind: 'keyword' },
      },
      verify: ['https://lda.gov/filings/abc.pdf'],
      method: 'P1 … Topic, not position',
    },
    committees: [{ id: 'C00360354', name: 'AMAZON PAC', method: 'name-prefix' }],
    clients: [{ id: 50892, name: 'AMAZON.COM SERVICES LLC', method: 'exact' }],
    employers: [{ employer: 'AMAZON.COM', amount: 800000 }],
    lean: {
      leanScore: 1,
      r: -0.4,
      totalPartisanUsd: 2_000_000,
      confidence: 'high',
      cycles: [2022, 2024],
      method: 'r',
    },
    sourceHint: 'FEC 2021–2024: …',
    links: {
      fec: ['https://www.fec.gov/data/committee/C00360354/'],
      lda: [],
      opensecrets: 'https://www.opensecrets.org/orgs/all-profiles?q=Amazon',
    },
  };
}

describe('Political facts export', () => {
  beforeEach(() => {
    // The card is compact in simple mode; these assertions cover the full card.
    useViewStore.setState({ viewMode: 'detailed', viewModeTouched: true });
  });

  it('renders the not-seeded state, or real facts + a valid bundled pack when seeded', () => {
    render(<PoliticalFactsPanel />);
    if (!hasPoliticalFacts()) {
      expect(POLITICAL_PACK_SIZE).toBe(0);
      expect(screen.getByText(/Not seeded yet/)).toBeInTheDocument();
      expect(screen.getByText(/seed:political/)).toBeInTheDocument();
      const r = parseDataPack(POLITICAL_PACK_JSON);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/non-empty/);
    } else {
      expect(
        screen.getByRole('button', { name: /bundled political-money pack/ }),
      ).toBeInTheDocument();
      const r = parseDataPack(POLITICAL_PACK_JSON);
      expect(r.ok).toBe(true); // the shipped pack must pass the same validation users' packs do
      if (r.ok) {
        expect(r.companies.length).toBe(POLITICAL_PACK_SIZE);
        // never asserts values ratings; every record cites the method doc and a lean or "not assigned"
        expect(r.companies.every((c) => Object.keys(c.ratings).length === 0)).toBe(true);
        expect(
          r.companies.every((c) => /docs\/political-seed\.md/.test(c.political.sourceHint)),
        ).toBe(true);
        expect(
          r.companies.every(
            (c) => c.political.leanScore === null || Math.abs(c.political.leanScore) <= 2,
          ),
        ).toBe(true);
      }
    }
  });

  it('renders a fact card with neutral party splits, lobbying, and verify links', () => {
    const f = sampleFact();
    render(<PoliticalFactCard f={f} />);
    expect(screen.getByText(/lean \+1 · high confidence/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /Company PAC: to Democrats 45%, Republicans 45%, third parties 0%, non-party recipients 9%/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Employees\*: to Democrats 90%, Republicans 10%/ }),
    ).toBeInTheDocument();
    // executive subset shown as its own stream with its own lean; pooled lean unchanged (+1)
    expect(
      screen.getByRole('img', { name: /senior execs†: to Democrats 80%, Republicans 20%/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/· lean \+2/).length).toBe(2); // employees and executives streams
    expect(screen.getByText(/· lean 0/)).toBeInTheDocument(); // PAC stream
    // Axis-2 activity panel: labelled as activity, weighted share leads, any-code is the ceiling
    expect(screen.getByText('activity, not position')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /Trade and tariff lobbying: 10% issue-weighted, up to 79% of filings dollars/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/trade \(TRD\) 40/)).toBeInTheDocument();
    expect(screen.getByText(/antitrust 12/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /filing 1/ })).toHaveAttribute(
      'href',
      'https://lda.gov/filings/abc.pdf',
    );
    expect(screen.getByText(/\$19\.0M/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /FEC/ })).toHaveAttribute(
      'href',
      'https://www.fec.gov/data/committee/C00360354/',
    );
    expect(screen.getByRole('link', { name: /OpenSecrets/ })).toBeInTheDocument();
  });

  it('shipped facts carry aggregates only — never donor-level fields (52 U.S.C. §30111(a)(4))', () => {
    const donorKey =
      /^(donor|contributor|contributorName|address|street|zip|zipCode|city|firstName|lastName|occupation|transactionId|subId)$/i;
    const offenders: string[] = [];
    const walk = (v: unknown, at: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          if (donorKey.test(k)) offenders.push(`${at}.${k}`);
          else walk(x, `${at}.${k}`);
        }
    };
    walk(POLITICAL_FACTS, 'facts');
    expect(offenders).toEqual([]);
    // employer strings are exact alias matches of company names by construction — and top-40 aggregates
    for (const c of POLITICAL_FACTS.companies) expect(c.employers.length).toBeLessThanOrEqual(12);
  });

  it('simple mode shows the pooled lean and the two headline streams, not the executive tier or topics', () => {
    useViewStore.setState({ viewMode: 'simple', viewModeTouched: true });
    const f = sampleFact();
    render(<PoliticalFactCard f={f} />);
    expect(screen.getByText(/lean \+1 · high confidence/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Company PAC:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Employees\*:/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /senior execs/ })).not.toBeInTheDocument();
    expect(screen.queryByText('activity, not position')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Switch to Detailed for the senior-executive stream/),
    ).toBeInTheDocument();
  });
});
