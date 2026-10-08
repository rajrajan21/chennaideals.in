import React from "react";

type Props = { children?: React.ReactNode; fallback?: React.ReactNode };
type State = { error: Error | null };

export default class AiroErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 24 }}>
            <h2>Something went wrong</h2>
            <pre>{this.state.error.message}</pre>
          </div>
        )
      );
    }
    return this.props.children;
  }
}