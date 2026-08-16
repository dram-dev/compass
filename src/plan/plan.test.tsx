import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlanPage } from './PlanPage';
import { useCompassStore } from '@/store/useCompassStore';
import { loadJordan } from '@/data/fixtures/jordan';
import { computeScores } from '@/store/scoring';

beforeEach(() => {
  localStorage.clear();
  useCompassStore.getState().resetAll();
  Element.prototype.scrollIntoView = vi.fn();
});

const renderPlan = (path = '/plan') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PlanPage />
    </MemoryRouter>,
  );

describe('Plan page', () => {
  it('empty state renders without crashing', () => {
    renderPlan();
    expect(screen.getByText(/Nothing to plan yet/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Projected trajectory/ })).toBeInTheDocument();
  });

  it('Jordan: cover, trajectory, three gates with badges, before/after, provenance footnote', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    renderPlan();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Jordan's plan");
    expect(
      screen.getByRole('img', { name: /Projected trajectory: Today 42.0/ }),
    ).toBeInTheDocument();
    const gates = screen.getAllByTestId('gate-column');
    expect(gates).toHaveLength(3);
    expect(within(gates[0]!).getAllByText('FREE WIN').length).toBeGreaterThan(0);
    expect(
      within(gates[0]!).getAllByText(/cost-neutral|saves \$|small cost|moderate cost/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Current political exposure/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Optimal political exposure/ })).toBeInTheDocument();
    expect(screen.getByText(/About the data/)).toBeInTheDocument();
    expect(screen.getByText(/Local multiplier/)).toBeInTheDocument();
    expect(screen.getByText(/Investment scenarios — by vehicle class/)).toBeInTheDocument();
  });

  it('Move to (keyboard path) reallocates and recomputes projections; dismiss/restore remembered', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    renderPlan();
    const before = computeScores(useCompassStore.getState());
    const g1Before = before.plan.gates[0]!.projectedIndex;
    const first = before.plan.gates[0]!.actions[0]!;
    const sel = screen
      .getAllByLabelText(/^Move "/)
      .find((el) => (el as HTMLSelectElement).value === 'g1')!;
    fireEvent.change(sel, { target: { value: 'g3' } });
    const st = useCompassStore.getState();
    expect(Object.values(st.placements)).toContain('g3');
    const after = computeScores(st);
    expect(after.plan.gates[0]!.projectedIndex).not.toBeCloseTo(g1Before, 5);
    expect(after.plan.gates[2]!.actions).toContain(Object.keys(st.placements)[0]);
    void first;
    // dismiss the first visible action
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(useCompassStore.getState().dismissed).toHaveLength(1);
    expect(screen.getByText(/1 dismissed action/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'restore' }));
    expect(useCompassStore.getState().dismissed).toHaveLength(0);
  });

  it('?action=<id> highlights and scrolls to the action card', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    const s = computeScores(useCompassStore.getState());
    const id = s.plan.gates[0]!.actions[0]!;
    renderPlan(`/plan?action=${encodeURIComponent(id)}`);
    const card = document.getElementById(`action-${id}`)!;
    expect(card.className).toMatch(/ring-brass/);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('gate configuration: cadence preset, budgets and add/remove gate flow through', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly' }));
    expect(useCompassStore.getState().gates.map((g) => g.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(screen.getAllByTestId('gate-column')).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Effort budget for Q1'), { target: { value: '2' } });
    expect(useCompassStore.getState().gates[0]!.effortBudget).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '+ add gate' }));
    expect(screen.getAllByTestId('gate-column')).toHaveLength(5);
  });
});
