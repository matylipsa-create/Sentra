import { Component, type ReactNode, type ErrorInfo } from 'react';
import SentraHUD from '../components/SentraHUD';
import SentinelIntegration from '../components/SentinelIntegration';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DashboardErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Dashboard] ErrorBoundary capturó:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: '#dc2626',
            color: '#ffffff',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'monospace',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Error al cargar el Dashboard
          </h1>
          <p style={{ fontSize: '0.75rem', opacity: 0.85, maxWidth: '400px' }}>
            {this.state.error?.message ?? 'Error desconocido'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Dashboard() {
  console.log('Dashboard renderizado');
  console.log('Dashboard renderizado — return');

  return (
    <DashboardErrorBoundary>
      <SentraHUD />
      <SentinelIntegration />
    </DashboardErrorBoundary>
  );
}
