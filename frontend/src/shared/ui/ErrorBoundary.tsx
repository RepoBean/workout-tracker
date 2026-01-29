import { Component, ReactNode } from 'react';
import { Button } from './Button';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[50vh] flex items-center justify-center p-4">
                    <div className="card max-w-md w-full text-center">
                        <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
                            Something went wrong
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <div className="flex gap-2 justify-center">
                            <Button variant="secondary" onClick={() => window.location.href = '/'}>
                                Go Home
                            </Button>
                            <Button variant="primary" onClick={this.handleReset}>
                                Try Again
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
