import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 24, textAlign: 'center', maxWidth: 600, margin: '40px auto' }}>
          <h2 style={{ color: '#ff4d4f' }}>应用出错</h2>
          <div style={{ margin: 16, padding: 12, background: '#fff1f0', border: '1px solid #ff4d4f', borderRadius: 8, textAlign: 'left', fontSize: 13, wordBreak: 'break-all' }}>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {this.state.error?.toString()}
            </pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 24px', fontSize: 16, marginTop: 16,
              background: '#1677ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
