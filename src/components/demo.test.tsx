import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/App';
import { DemoBanner, LoadDemoButton } from './Demo';
import { useCompassStore } from '@/store/useCompassStore';
import { useViewStore } from '@/store/useViewMode';

beforeEach(() => {
  localStorage.clear();
  useCompassStore.getState().resetAll();
  useViewStore.setState({ viewMode: 'simple', viewModeTouched: true, demoActive: false });
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('demo scenario', () => {
  it('loads the worked persona and marks the session as demo', () => {
    render(
      <MemoryRouter>
        <LoadDemoButton />
      </MemoryRouter>,
    );
    expect(useCompassStore.getState().categories.every((c) => c.monthlySpend === 0)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Load the demo scenario/ }));
    const s = useCompassStore.getState();
    expect(s.profile.name).toBe('Jordan');
    expect(s.categories.reduce((a, c) => a + c.monthlySpend, 0)).toBe(3800);
    expect(s.holdings.length).toBeGreaterThan(0);
    expect(s.political.configured).toBe(true);
    expect(useViewStore.getState().demoActive).toBe(true);
  });

  it('asks before replacing data the user already entered', () => {
    act(() => useCompassStore.getState().setCategorySpend('groceries', 500));
    render(
      <MemoryRouter>
        <LoadDemoButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Load the demo scenario/ }));
    expect(screen.getByText(/Replace your current numbers/)).toBeInTheDocument();
    // declining keeps the user's own figures
    fireEvent.click(screen.getByRole('button', { name: /Keep mine/ }));
    expect(
      useCompassStore.getState().categories.find((c) => c.id === 'groceries')!.monthlySpend,
    ).toBe(500);
    expect(useViewStore.getState().demoActive).toBe(false);
    // accepting loads the persona
    fireEvent.click(screen.getByRole('button', { name: /Load the demo scenario/ }));
    fireEvent.click(screen.getByRole('button', { name: /Yes, load demo/ }));
    expect(useCompassStore.getState().profile.name).toBe('Jordan');
  });

  it('banner labels the data as illustrative and clears it on request', () => {
    useViewStore.setState({ demoActive: true });
    act(() => useCompassStore.getState().loadState({ ...useCompassStore.getState() }));
    render(
      <MemoryRouter>
        <DemoBanner />
      </MemoryRouter>,
    );
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/Demo data/);
    expect(banner.textContent).toMatch(/illustrative persona/);
    expect(banner.textContent).toMatch(/not real-company research and not your data/);
    fireEvent.click(screen.getByRole('button', { name: /Clear demo data/ }));
    expect(useViewStore.getState().demoActive).toBe(false);
    expect(useCompassStore.getState().categories.every((c) => c.monthlySpend === 0)).toBe(true);
  });

  it('the #/demo route loads the persona and lands on a populated dashboard with the banner', async () => {
    renderAt('/demo');
    await act(async () => {});
    expect(useCompassStore.getState().profile.name).toBe('Jordan');
    expect(useViewStore.getState().demoActive).toBe(true);
    expect(screen.getByRole('img', { name: /Alignment index dial: 42.0/ })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toMatch(/Demo data/);
    expect(screen.queryByText(/Nothing to score yet/)).not.toBeInTheDocument();
  });

  it('an empty dashboard offers the demo instead of a dead end', () => {
    renderAt('/dashboard');
    expect(screen.getByText(/Nothing to score yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Load the demo scenario/ }));
    expect(useCompassStore.getState().profile.name).toBe('Jordan');
  });
});
