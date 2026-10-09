import React from 'react';
import { Card, Button } from '../ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <Card className="max-w-md w-full p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-status-critical-bg text-status-critical-text flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-main">
                This page encountered an error
              </h3>
              <p className="text-xs text-text-muted mt-1 break-words">
                {this.state.error?.message || 'An unexpected rendering error occurred.'}
              </p>
            </div>
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={this.handleRetry} className="w-full justify-center">
                <RefreshCw className="w-4 h-4 mr-2" />
                <span>Retry Page</span>
              </Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
