import { Component, type ReactNode } from 'react';

/** Keeps one broken page from blanking the app; the navigation still works. */
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
      <section className="card" role="alert">
        <h2 className="text-lg font-semibold">This page hit a problem</h2>
        <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        <p className="mt-2 text-sm">Switch pages to keep going, or reset the demo from the demo panel (Ctrl+Shift+D).</p>
      </section>
    );
  }
}
