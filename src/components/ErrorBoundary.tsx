import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onError: (message: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message);
    console.error('[SENTRA ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#ef4444', fontFamily: 'monospace', fontSize: 12 }}>
          <p style={{ fontWeight: 'bold', marginBottom: 8 }}>Error capturado:</p>
          <p style={{ wordBreak: 'break-word' }}>{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
