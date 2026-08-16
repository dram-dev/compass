import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PoliticalFactCard, PoliticalFactsPanel } from './PoliticalFactsPanel';
import { hasPoliticalFacts, POLITICAL_PACK_SIZE, type PoliticalFact } from '@/data/politicalFacts';
import { parseDataPack } from '@/data/dataPack';
import { POLITICAL_PACK_JSON } from '@/data/politicalFacts';

describe('Political facts (placeholder export)', () => {
  it('ships empty, well-formed placeholders until the seed runs', () => {
    expect(hasPoliticalFacts()).toBe(false);
    expect(POLITICAL_PACK_SIZE).toBe(0);
    render(<PoliticalFactsPanel />);
    expect(screen.getByText(/Not seeded yet/)).toBeInTheDocument();
    expect(screen.getByText(/seed:political/)).toBeInTheDocument();
    // the bundled pack is a valid (if empty) data pack shape apart from the non-empty rule
    const r = parseDataPack(POLITICAL_PACK_JSON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/non-empty/);
  });

  it('renders a fact card with neutral party splits, lobbying, and verify links', () => {
    const f: PoliticalFact = {
      symbol: 'AMZN',
      name: 'Amazon',
      pac: {},
      employee: {},
      totals: {
        pac: { D: 500000, R: 500000, O: 0, U: 100000 },
        employee: { D: 900000, R: 100000, O: 0, U: 0 },
      },
      lobbying: { 2024: 19_000_000 },
      topIssues: [{ name: 'Taxation', filings: 4 }],
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
    render(<PoliticalFactCard f={f} />);
    expect(screen.getByText(/lean \+1 · high confidence/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /Company PAC: to Democrats 45%, Republicans 45%, third parties 0%, non-party recipients 9%/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Employees: to Democrats 90%, Republicans 10%/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$19\.0M/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /FEC/ })).toHaveAttribute(
      'href',
      'https://www.fec.gov/data/committee/C00360354/',
    );
    expect(screen.getByRole('link', { name: /OpenSecrets/ })).toBeInTheDocument();
  });
});
