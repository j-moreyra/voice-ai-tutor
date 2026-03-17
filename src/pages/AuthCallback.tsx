import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let resolved = false

    const complete = () => {
      if (resolved) return
      resolved = true
      subscription.unsubscribe()
      navigate('/', { replace: true })
    }

    // Listen for auth state changes (handles hash fragment parsing)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        complete()
      }
    })

    // Also check if session already exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        complete()
      }
    })

    // Fallback: if no auth event fires within 15s, show an explicit error
    // and let the user choose what to do next.
    const timeout = setTimeout(() => {
      if (resolved) return
      resolved = true
      subscription.unsubscribe()
      setError('Authentication is taking longer than expected. Please try signing in again.')
    }, 15000)

    return () => {
      resolved = true
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="max-w-sm text-center animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft">
            <svg className="h-6 w-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/signin"
              className="btn-press rounded-btn border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-border-bright hover:text-text"
            >
              Back to Sign in
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="btn-press rounded-btn bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
    </div>
  )
}
