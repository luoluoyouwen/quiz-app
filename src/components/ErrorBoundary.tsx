import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button, Typography } from 'antd';

const { Text, Title } = Typography;

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
        <div className="error-boundary-page">
          <div className="error-boundary-card">
            <Text className="subpage-eyebrow">运行异常</Text>
            <Title level={3}>应用出错</Title>
            <Text type="secondary">当前页面遇到异常，刷新后会重新加载题库和练习状态。</Text>
            <pre className="error-boundary-detail">
              {this.state.error?.toString()}
            </pre>
            <Button type="primary" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
