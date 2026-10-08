import React from "react";

type Props = { children?: React.ReactNode };
type State = { hasError: boolean };

export default class CookieBannerErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("Cookie banner failed:", error);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}