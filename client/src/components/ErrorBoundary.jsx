import { Component } from "react";

// App-root error boundary: catches render-time exceptions anywhere in the tree
// so a single component fault degrades to a recoverable message instead of a
// blank-white SPA crash.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface for debugging; a production deployment would forward this to an
    // error-tracking service.
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign("/");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <h1>Something went wrong</h1>
            <p>An unexpected error occurred. Reloading usually fixes it.</p>
            <button type="button" className="primary" onClick={this.handleReload}>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
