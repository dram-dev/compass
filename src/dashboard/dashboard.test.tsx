import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { useCompassStore } from '@/store/useCompassStore';
import { loadJordan } from '@/data/fixtures/jordan';

// Recharts ResponsiveContainer needs a size in jsdom.
beforeEach(() => {
  localStorage.clear();
  useCompassStore.getState().resetAll();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 360,
      top: 0,
      left: 0,
      right: 800,
      bottom: 360,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

const renderDash = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

describe('Dashboard', () => {
  it('zero-data state: every section renders an empty/partial-data message, no crash', () => {
    renderDash();
    expect(screen.getByText(/Nothing to score yet/)).toBeInTheDocument();
    expect(screen.getByText(/No spending yet/)).toBeInTheDocument();
    expect(screen.getByText(/Add categories with spend/)).toBeInTheDocument();
    expect(screen.getByText(/not configured/)).toBeInTheDocument();
    expect(screen.getByText(/No candidate swaps yet/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Alignment index dial/ })).toBeInTheDocument();
  });

  it('Jordan: dial, sankey, slope, political drill-down, radar, pareto all render; goal toggle re-scores live', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    renderDash();
    expect(screen.getByRole('img', { name: /Alignment index dial: 42.0/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Spending flow, current/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Category slope chart/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Current political exposure/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Optimal political exposure/ })).toBeInTheDocument();
    expect(screen.getByText(/can't be assessed yet/)).toBeInTheDocument();
    // drill-down: opposed by default → NationalMart with parent roll-up + verify link
    expect(screen.getByText('NationalMart')).toBeInTheDocument();
    expect(screen.getByText(/parent: Omnicorp Holdings/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Verify at source/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Aligned · / }));
    expect(screen.getByText('Green Fields Co-op')).toBeInTheDocument();
    // goal toggle (sticky header) re-scores everywhere
    const toggle = screen.getAllByRole('radiogroup', {
      name: /What do you want to accomplish/,
    })[0]!;
    fireEvent.click(within(toggle).getByRole('radio', { name: 'Political' }));
    expect(useCompassStore.getState().goalMode).toBe('political-alignment');
    expect(
      screen.queryByRole('img', { name: /Alignment index dial: 42.0/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Alignment index dial: 45.4/ })).toBeInTheDocument();
  });

  it('sankey: lens and state toggles swap the active layout, legend, and disclaimer', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    renderDash();
    fireEvent.click(screen.getByRole('radio', { name: 'Optimal' }));
    expect(screen.getByRole('img', { name: /Spending flow, optimal/ })).toBeInTheDocument();
    expect(
      screen.queryByText(/Educational scenarios, not financial advice/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Investments' }));
    expect(screen.getByRole('img', { name: /Investments flow, optimal/ })).toBeInTheDocument();
    expect(screen.getByText(/Educational scenarios, not financial advice/)).toBeInTheDocument();
    expect(screen.getAllByText('Community-aligned').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unknown / unrated').length).toBeGreaterThan(0);
  });

  it('political panel: unconfigured state links to step 3 and shows everything as Unknown', () => {
    const j = loadJordan();
    j.political = { configured: false, direction: 0, intensity: 0.5 };
    act(() => useCompassStore.getState().loadState(j));
    renderDash();
    expect(screen.getByText(/Political preference not configured/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Set it up/ })).toHaveAttribute('href', '/wizard/3');
    expect(
      screen.getByRole('img', {
        name: /Current political exposure: Aligned 0%, Mixed 0%, Opposed 0%, Unknown 100%/,
      }),
    ).toBeInTheDocument();
  });
});
