import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CsvImportPanel } from './CsvImportPanel';
import { useCompassStore } from '@/store/useCompassStore';
import { CHASE } from '@/lib/fixtures/statements';

beforeEach(() => {
  localStorage.clear();
  useCompassStore.getState().resetAll();
});

/** jsdom's File lacks .text() in some versions; provide it explicitly. */
function csvFile(name: string, text: string): File {
  const f = new File([text], name, { type: 'text/csv' });
  Object.defineProperty(f, 'text', { value: () => Promise.resolve(text) });
  return f;
}

async function loadChase() {
  render(<CsvImportPanel />);
  const input = screen.getByLabelText(/Choose statement CSV files/);
  await act(async () => {
    fireEvent.change(input, { target: { files: [csvFile('chase.csv', CHASE)] } });
  });
  await waitFor(() => expect(screen.getByText(/20 rows/)).toBeInTheDocument());
}

describe('CSV statement import', () => {
  it('summarises a Chase export, previews per-category monthly spend, and applies on confirmation', async () => {
    await loadChase();
    // header summary: rows, spending rows, merchants, date range, detected months
    expect(screen.getByText(/18 spending/)).toBeInTheDocument();
    // the range spans the *spending* rows: 2025-12-15 was the excluded annual fee
    expect(document.body.textContent).toMatch(/2025-12-22 → 2026-02-28/);
    expect(screen.getByLabelText(/Months of data/)).toHaveValue(2.5);
    expect(screen.getByText(/Card \/ loan payments 1/)).toBeInTheDocument();

    // preview table has the categories the statement implies
    expect(screen.getByRole('heading', { name: /what will be applied/i })).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: /Import preview by category/ });
    expect(within(preview).getByText('Groceries')).toBeInTheDocument();
    expect(within(preview).getByText('Dining & coffee')).toBeInTheDocument();

    // nothing is stored until Apply
    expect(useCompassStore.getState().categories.every((c) => c.monthlySpend === 0)).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Apply to my categories/ }));
    });
    const cats = useCompassStore.getState().categories;
    const groceries = cats.find((c) => c.id === 'groceries')!;
    expect(groceries.monthlySpend).toBe(Math.round(543.51 / 2.5));
    // majors are named from the shipped sample companies; the co-op stays unknown until classified
    const major = groceries.current.find((a) => a.bucket === 'major')!;
    expect(major.namedCompanyIds).toContain('whole-foods');
    expect(major.rangePct[0]).toBeLessThan(major.rangePct[1]);
    const unknown = groceries.current.find((a) => a.bucket === 'unknown')!;
    expect(unknown.rangePct[1]).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toMatch(
      /Applied \$404\/month across 6 categories/,
    );
  });

  it('classifying an unrecognised merchant moves it out of Unknown and names it as a user company', async () => {
    await loadChase();
    const list = screen.getByRole('heading', { name: /Classify \d+ unrecognised merchant/ });
    expect(list).toBeInTheDocument();
    // Green Fields Coop is unrecognised; mark it a local independent
    const merchants = screen.getByRole('list', { name: /Unrecognised merchants/ });
    const row = within(merchants)
      .getByText(/Green Fields Coop/)
      .closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Local' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Apply to my categories/ }));
    });
    const groceries = useCompassStore.getState().categories.find((c) => c.id === 'groceries')!;
    const local = groceries.current.find((a) => a.bucket === 'local')!;
    expect(local.rangePct[1]).toBeGreaterThan(0);
    const created = useCompassStore.getState().userCompanies;
    expect(created.map((c) => c.name)).toContain('Green Fields Coop');
    expect(created.find((c) => c.name === 'Green Fields Coop')).toMatchObject({
      bucketDefault: 'local',
      ratingsProvenance: 'user',
    });
    expect(local.namedCompanyIds.length).toBeGreaterThan(0);
  });

  it('skipping a merchant removes its dollars; the months field rescales everything', async () => {
    await loadChase();
    const merchants = screen.getByRole('list', { name: /Unrecognised merchants/ });
    const row = within(merchants)
      .getByText(/Joes Pizza/)
      .closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /skip/ }));
    // 1 month instead of 2.5 → larger monthly figures
    fireEvent.change(screen.getByLabelText(/Months of data/), { target: { value: '1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Apply to my categories/ }));
    });
    const dining = useCompassStore.getState().categories.find((c) => c.id === 'dining')!;
    // dining without the pizza place: 6.75 + 5.45 + 11.25 + 14.80 = 38.25 over 1 month
    expect(dining.monthlySpend).toBe(38);
  });

  it('rejects a file with no usable columns and keeps the user informed', async () => {
    render(<CsvImportPanel />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Choose statement CSV files/), {
        target: { files: [csvFile('notes.csv', 'note\nhello\nworld')] },
      });
    });
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't find a description and amount/);
    expect(
      screen.queryByRole('button', { name: /Apply to my categories/ }),
    ).not.toBeInTheDocument();
  });

  it('states plainly that the file is never uploaded', async () => {
    render(<CsvImportPanel />);
    expect(screen.getByText(/never uploaded/)).toBeInTheDocument();
  });
});
