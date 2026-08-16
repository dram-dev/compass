import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

/** Keeps one broken chart from taking down the page; offers a retry. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV)
      console.error('[Compass] section failed:', this.props.label, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="callout !border-opposed">
          <b className="text-ink">
            This section couldn't render{this.props.label ? ` (${this.props.label})` : ''}.
          </b>{' '}
          {this.state.error.message}{' '}
          <button
            type="button"
            className="chip ml-2 hover:border-ink hover:text-ink"
            onClick={() => this.setState({ error: null })}
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
