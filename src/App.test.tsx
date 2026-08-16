import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App shell', () => {
  it('renders the masthead and both persistent disclaimers', () => {
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(
      screen.getByText(/Educational scenario tool — not financial, investment, or tax advice/),
    ).toBeInTheDocument();
    expect(screen.getByText(/verify before acting/)).toBeInTheDocument();
  });
});
