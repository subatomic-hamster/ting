import { Component, type ReactNode } from 'react';
import { useAppStore } from '../store';

/** Clears the saved draft of the current demo member (all `ting.draft.*` keys for it), then reloads. */
function resetMember() {
  let persona = new URLSearchParams(window.location.search).get("persona") ?? "dale";
  try {
    persona = useAppStore.getState().personaId || persona;
  } catch {
    /* the store itself may be what failed */
  }
  for (const area of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of Object.keys(area))
        if (key.startsWith("ting.draft.") && key.includes(`.${persona}.`)) area.removeItem(key);
    } catch {
      /* storage unavailable: the reload below still gives a fresh start */
    }
  }
  window.location.reload();
}

/** Last line of defense around the whole app: a render error shows a way out instead of a blank page. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto max-w-xl p-6" role="alert">
        <h1 className="text-xl font-semibold">Something went wrong on our side</h1>
        <p className="mt-2 text-base">
          Ting couldn&rsquo;t show this page. Your plan documents and dentist&rsquo;s plan are not changed. Try again,
          or reset this demo member to its starting data.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button type="button" className="btn-secondary" onClick={resetMember}>
            Reset this demo member
          </button>
        </div>
        <details className="mt-4 text-sm text-muted">
          <summary className="cursor-pointer">Technical detail</summary>
          <p className="mt-1 break-words">{this.state.error.message}</p>
        </details>
      </main>
    );
  }
}

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
