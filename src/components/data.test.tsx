import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataSourcesPage } from './DataSourcesPage';
import { useCompassStore } from '@/store/useCompassStore';
import { useViewStore } from '@/store/useViewMode';
import { loadJordan } from '@/data/fixtures/jordan';
import { exportState, pickState } from '@/store/persistence';
import { EXAMPLE_DATA_PACK } from '@/data/dataPack';
import { STORAGE_KEY } from '@/store/schema';
import { ErrorBoundary } from './ErrorBoundary';

beforeEach(() => {
  // The Advanced/research panels are detail-only; simple-mode filtering is asserted below.
  useViewStore.setState({ viewMode: 'detailed', viewModeTouched: true });
  localStorage.clear();
  useCompassStore.getState().resetAll();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <DataSourcesPage />
    </MemoryRouter>,
  );

describe('Data page', () => {
  it('export → clear storage → import (paste) restores identical state', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    const before = pickState(useCompassStore.getState());
    const json = exportState(before);
    renderPage();
    // clear
    fireEvent.click(screen.getByRole('button', { name: /Clear all local data/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, erase' }));
    expect(useCompassStore.getState().categories[0]!.monthlySpend).toBe(0);
    localStorage.clear();
    // import via paste
    fireEvent.click(screen.getByText('Paste JSON instead'));
    fireEvent.change(screen.getByLabelText('Paste a Compass export and load it'), {
      target: { value: json },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0]!);
    expect(screen.getByRole('status')).toHaveTextContent(/Imported: 8 categories/);
    expect(pickState(useCompassStore.getState())).toEqual(before);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.profile.name).toBe('Jordan');
  });

  it('malformed import shows a specific error and changes nothing', () => {
    act(() => useCompassStore.getState().loadState(loadJordan()));
    renderPage();
    fireEvent.click(screen.getByText('Paste JSON instead'));
    fireEvent.change(screen.getByLabelText('Paste a Compass export and load it'), {
      target: { value: '{"schemaVersion":1,"goalMode":"nope"}' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0]!);
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing was changed.*goalMode/);
    expect(useCompassStore.getState().profile.name).toBe('Jordan');
  });

  it('data pack import loads companies with Imported provenance and reports source', () => {
    renderPage();
    fireEvent.click(screen.getByText('Paste a pack instead'));
    fireEvent.change(screen.getByLabelText('Paste a data pack and load it'), {
      target: { value: JSON.stringify(EXAMPLE_DATA_PACK) },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[1]!);
    expect(screen.getByRole('status')).toHaveTextContent(/Loaded 2 companies from “Example pack/);
    const imp = useCompassStore.getState().importedCompanies;
    expect(imp).toHaveLength(2);
    expect(imp[0]!.political.provenance).toBe('imported');
    expect(imp[0]!.source).toBe('Example pack (edit me)');
    // rejected pack
    fireEvent.change(screen.getByLabelText('Paste a data pack and load it'), {
      target: { value: '{"schema":"x"}' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[1]!);
    expect(screen.getByRole('alert')).toHaveTextContent(/schema must be/);
  });

  it('bucket-default Advanced panel edits flow into the store', () => {
    renderPage();
    fireEvent.change(
      screen.getByLabelText('Major corporation default rating for Labor practices'),
      { target: { value: '-2' } },
    );
    expect(useCompassStore.getState().bucketDefaults.major.labor).toBe(-2);
    fireEvent.click(screen.getByRole('button', { name: 'reset to shipped defaults' }));
    expect(useCompassStore.getState().bucketDefaults.major.labor).toBe(-1);
  });
});

describe('ErrorBoundary', () => {
  it('catches a render error and offers retry', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('kaboom');
    };
    render(
      <ErrorBoundary label="Test">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't render \(Test\)/);
    expect(screen.getByRole('alert')).toHaveTextContent(/kaboom/);
    spy.mockRestore();
  });

  it('simple mode hides the research panels and renumbers the rest', () => {
    useViewStore.setState({ viewMode: 'simple', viewModeTouched: false });
    render(
      <MemoryRouter>
        <DataSourcesPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /Data sources & how to verify/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Reset$/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Advanced: bucket-default ratings/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Fund look-through/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Political money facts/ }),
    ).not.toBeInTheDocument();
    // four visible sections, numbered without gaps
    expect(screen.getByText('04')).toBeInTheDocument(); // Reset is 04, not 07
    expect(screen.queryByText('05')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch to Detailed/ })).toBeInTheDocument();
  });
});
