import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FundLookthroughPanel } from './FundLookthroughPanel';
import { FUND_CONCENTRATION, fundsHolding, hasFundData } from '@/data/fundConcentration';

describe('Fund look-through (placeholder export)', () => {
  it('ships an empty, well-formed graph until the seed runs', () => {
    expect(FUND_CONCENTRATION.schema).toBe('compass-fund-concentration');
    expect(hasFundData()).toBe(false);
    expect(fundsHolding('AAPL')).toEqual([]);
  });
  it('renders the not-seeded state with instructions', () => {
    render(<FundLookthroughPanel />);
    expect(screen.getByText(/Not seeded yet/)).toBeInTheDocument();
    expect(screen.getByText(/npm run seed/)).toBeInTheDocument();
  });
});
