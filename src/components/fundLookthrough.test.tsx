import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FundLookthroughPanel } from './FundLookthroughPanel';
import { FUND_CONCENTRATION, fundsHolding, hasFundData } from '@/data/fundConcentration';

describe('Fund look-through export', () => {
  it('is a well-formed graph (empty placeholder or seeded) and the panel renders accordingly', () => {
    expect(FUND_CONCENTRATION.schema).toBe('compass-fund-concentration');
    render(<FundLookthroughPanel />);
    if (!hasFundData()) {
      expect(fundsHolding('AAPL')).toEqual([]);
      expect(screen.getByText(/Not seeded yet/)).toBeInTheDocument();
      expect(screen.getByText(/npm run seed/)).toBeInTheDocument();
    } else {
      expect(FUND_CONCENTRATION.funds.length).toBeGreaterThan(100);
      expect(FUND_CONCENTRATION.companies.length).toBeGreaterThan(100);
      // every edge references known nodes; weights are fractions
      const funds = new Set(FUND_CONCENTRATION.funds.map((f) => f.symbol));
      const cos = new Set(FUND_CONCENTRATION.companies.map((c) => c.symbol));
      expect(
        FUND_CONCENTRATION.edges.every(
          (e) => funds.has(e.fund) && cos.has(e.company) && e.weight > 0 && e.weight <= 1,
        ),
      ).toBe(true);
      // ranks are 1..N and the top company is held by many funds
      expect(FUND_CONCENTRATION.funds.every((f) => f.rank >= 1)).toBe(true);
      expect(FUND_CONCENTRATION.companies[0]!.fundsHolding).toBeGreaterThan(20);
      expect(fundsHolding(FUND_CONCENTRATION.companies[0]!.symbol).length).toBeGreaterThan(5);
      expect(screen.getByText(/Highest concentration across the top/)).toBeInTheDocument();
    }
  });
});
