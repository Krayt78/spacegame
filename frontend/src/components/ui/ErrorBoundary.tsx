'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in the component tree and shows a fallback UI
 * instead of a blank white screen.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-bg-card border border-accent-danger/40 p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-accent-danger text-2xl">!!</span>
            <h2 className="font-display text-lg font-bold text-accent-danger uppercase tracking-wider">
              Something Went Wrong
            </h2>
          </div>

          <p className="text-text-secondary text-sm leading-relaxed mb-4">
            An unexpected error occurred. Try reloading the page.
          </p>

          {this.state.error && (
            <div className="bg-bg-primary border border-bg-tertiary p-4 mb-6 font-mono text-xs text-text-muted overflow-auto max-h-32">
              {this.state.error.message}
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="w-full px-5 py-2.5 text-sm font-mono font-semibold uppercase tracking-wider bg-accent-primary text-bg-primary hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
