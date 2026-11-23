import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class JobPostErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The Job Post module failed to render:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <h1 className="text-xl font-bold text-red-800">
            Job Post module could not be displayed
          </h1>
          <p className="mt-2 text-sm text-red-700">
            Please refresh the page or try again. Your data has not been removed.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-[#0759AE] px-5 py-3 text-sm font-bold text-white"
          >
            Reload Page
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
