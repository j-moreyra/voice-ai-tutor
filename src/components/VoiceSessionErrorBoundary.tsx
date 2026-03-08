import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  materialId?: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class VoiceSessionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('VoiceSession error boundary caught:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const backPath = this.props.materialId
        ? `/study/${this.props.materialId}`
        : '/'

      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-5">
          <div className="max-w-sm text-center animate-fade-in">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft">
              <svg
                className="h-6 w-6 text-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
            </div>
            <p className="text-sm text-text-secondary">
              Something went wrong with the voice session. This might be a temporary issue.
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <Link
                to={backPath}
                className="btn-press rounded-btn border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-border-bright hover:text-text"
              >
                Back to Study Plan
              </Link>
              <button
                onClick={this.handleRetry}
                className="btn-press rounded-btn bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
