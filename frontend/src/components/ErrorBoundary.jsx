/**
 * Error Boundary Component
 * Catches errors in child components and displays fallback UI
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          margin: '20px'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <AlertCircle size={64} color="#dc2626" strokeWidth={1.5} />
          </div>
          <h2 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#991b1b',
            marginBottom: '8px'
          }}>
            Something went wrong
          </h2>
          <p style={{
            fontSize: '14px',
            color: '#7f1d1d',
            textAlign: 'center',
            marginBottom: '16px'
          }}>
            The component encountered an error. Please try refreshing the page.
          </p>
          {this.state.error && (
            <details style={{
              padding: '12px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              maxWidth: '600px',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: '600' }}>
                Error Details
              </summary>
              <pre style={{
                marginTop: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
