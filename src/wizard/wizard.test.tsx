import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WizardPage } from './WizardPage';
import { useCompassStore } from '@/store/useCompassStore';
import { useViewStore } from '@/store/useViewMode';
import { loadJordan } from '@/data/fixtures/jordan';
import { STORAGE_KEY } from '@/store/schema';

function renderWizard(path = '/wizard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wizard/*" element={<WizardPage />} />
        <Route path="/dashboard" element={<div>DASH</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // These walk the full 7-step path; the simple 3-step path is asserted separately below.
  useViewStore.setState({ viewMode: 'detailed', viewModeTouched: true });
  localStorage.clear();
  useCompassStore.getState().resetAll();
});

describe('Wizard', () => {
  it('renders step 1, navigates with Continue/Back and the rail, and persists the step per change', () => {
    renderWizard();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What do you want to accomplish?',
    );
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Which principles matter');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.wizard.step).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(useCompassStore.getState().wizard.step).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /Current mix/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Where does the money go today?',
    );
  });

  it('deep link #/wizard/6 opens step 6', () => {
    renderWizard('/wizard/6');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Define your optimal');
  });

  it('goal-mode toggle in step 1 re-weights principles live', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('radio', { name: 'Political alignment' }));
    expect(
      useCompassStore.getState().principles.find((p) => p.id === 'political-alignment')!.weight,
    ).toBe(60);
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText(/Set up in step 3 or this contributes 0/)).toBeInTheDocument();
  });

  it('Jordan: step 4 shows every category and the live 42.0 preview; edits persist per keystroke', () => {
    act(() => {
      useCompassStore.getState().loadState({
        ...loadJordan(),
        wizard: { step: 4, completed: false, targetsCustomized: true },
      });
    });
    renderWizard();
    expect(screen.getAllByTestId(/category-card-/)).toHaveLength(8);
    expect(screen.getAllByText('42.0').length).toBeGreaterThan(0); // footer preview (+ groceries idx)
    const spend = screen.getByLabelText('Monthly spend for Groceries') as HTMLInputElement;
    fireEvent.change(spend, { target: { value: '1000' } });
    expect(useCompassStore.getState().categories[0]!.monthlySpend).toBe(1000);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.categories[0].monthlySpend).toBe(
      1000,
    );
    // merchant chips with parent roll-up and provenance badges
    expect(screen.getByText('NationalMart')).toBeInTheDocument();
    expect(screen.getByText('→ Omnicorp Holdings')).toBeInTheDocument();
    expect(screen.getAllByText('Sample — verify').length).toBeGreaterThan(0);
  });

  it('review step builds the plan and routes to the dashboard', () => {
    act(() => {
      useCompassStore.getState().loadState({
        ...loadJordan(),
        wizard: { step: 7, completed: false, targetsCustomized: true },
      });
    });
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Build my plan/ }));
    expect(useCompassStore.getState().wizard.completed).toBe(true);
    expect(screen.getByText('DASH')).toBeInTheDocument();
  });

  it('review step blocks when there is no spend', () => {
    act(() => useCompassStore.getState().setWizardStep(7));
    renderWizard();
    expect(screen.getByRole('button', { name: /Build my plan/ })).toBeDisabled();
    expect(screen.getByText(/Enter at least one category/)).toBeInTheDocument();
  });

  it('simple mode walks Intent → Current mix → Review, renumbering and skipping the rest', () => {
    useViewStore.setState({ viewMode: 'simple', viewModeTouched: true });
    renderWizard();
    expect(screen.getByText('STEP 1 / 3')).toBeInTheDocument();
    // the rail shows only the three visible steps
    const rail = screen.getByRole('navigation', { name: /Wizard progress/ });
    expect(within(rail).getByRole('button', { name: /Intent/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /Current mix/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /Review/ })).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: /Principles/ })).not.toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: /Political/ })).not.toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: /Investments/ })).not.toBeInTheDocument();
    // Continue jumps 1 → 4 (Current mix) → 7 (Review); ids stay canonical in the store
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(useCompassStore.getState().wizard.step).toBe(4);
    expect(screen.getByText('STEP 2 / 3')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Where does the money go today/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(useCompassStore.getState().wizard.step).toBe(7);
    expect(screen.getByText('STEP 3 / 3')).toBeInTheDocument();
    // Back returns down the visible path
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }));
    expect(useCompassStore.getState().wizard.step).toBe(4);
  });

  it('switching to simple while on a hidden step moves to the nearest visible step', () => {
    useViewStore.setState({ viewMode: 'detailed', viewModeTouched: true });
    act(() => useCompassStore.getState().setWizardStep(5)); // Investments
    renderWizard();
    expect(useCompassStore.getState().wizard.step).toBe(5);
    act(() => useViewStore.setState({ viewMode: 'simple', viewModeTouched: true }));
    expect(useCompassStore.getState().wizard.step).toBe(7); // 5 and 6 are hidden → Review
  });
});
