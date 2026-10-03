import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from blanking the app; the tabs still work. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel stack" role="alert">
        <h2>This screen hit a problem</h2>
        <p className="muted">{this.state.error.message}</p>
        <p>Switch tabs to keep going, or reset the demo data from Your decisions.</p>
      </section>
    );
  }
}
