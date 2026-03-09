import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { EducationLevel } from '../types/database'

const EDUCATION_LEVELS: { value: EducationLevel; label: string }[] = [
  { value: 'middle_school', label: 'Middle School' },
  { value: 'high_school', label: 'High School' },
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'graduate', label: 'Graduate' },
]

export default function SignUp() {
  const navigate = useNavigate()
  const { signUp, signInWithGoogle } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [educationLevel, setEducationLevel] = useState<EducationLevel>('undergraduate')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    const { error } = await signUp(email, password, firstName, educationLevel)
    setSubmitting(false)

    if (error) {
      setError(error)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Branding */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
            <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-text">Voice AI Tutor</h1>
          <p className="mt-1.5 text-sm text-text-secondary">Your AI Voice Tutor</p>
        </div>

        {/* Tabs */}
        <div className="mb-8 flex rounded-[10px] bg-surface p-1">
          <Link to="/signin" className="flex-1 rounded-btn py-2.5 text-center text-sm font-medium text-text-muted transition-colors hover:text-text-secondary">
            Sign in
          </Link>
          <div className="flex-1 rounded-btn bg-surface-hover py-2.5 text-center text-sm font-medium text-text">
            Sign up
          </div>
        </div>

        {error && (
          <div className="mb-5 animate-fade-in rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={async () => {
            const { error } = await signInWithGoogle()
            if (error) setError(error)
          }}
          className="btn-press mb-5 flex h-[44px] w-full items-center justify-center gap-3 rounded-btn border border-border bg-surface text-base font-medium text-text transition-colors hover:bg-surface-hover"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.42l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <div className="mb-5 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-muted">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="firstName" className="mb-2 block text-xs font-medium uppercase tracking-widest text-text-secondary">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-[44px] w-full rounded-btn border border-border bg-input-bg px-4 text-base text-text placeholder-text-muted transition-colors"
              placeholder="Your first name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-xs font-medium uppercase tracking-widest text-text-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[44px] w-full rounded-btn border border-border bg-input-bg px-4 text-base text-text placeholder-text-muted transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-xs font-medium uppercase tracking-widest text-text-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[44px] w-full rounded-btn border border-border bg-input-bg px-4 text-base text-text placeholder-text-muted transition-colors"
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label htmlFor="educationLevel" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-text-secondary">
              Education level
              <span
                title="This helps us tailor explanations to your level."
                className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-surface-hover text-[10px] text-text-muted normal-case tracking-normal"
              >
                ?
              </span>
            </label>
            <select
              id="educationLevel"
              value={educationLevel}
              onChange={(e) => setEducationLevel(e.target.value as EducationLevel)}
              className="h-[44px] w-full rounded-btn border border-border bg-input-bg px-4 text-base text-text transition-colors"
            >
              {EDUCATION_LEVELS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-press h-[44px] w-full rounded-btn bg-accent text-base font-medium text-white shadow-[0_0_20px_var(--color-accent-glow)] transition-all duration-200 hover:bg-accent-hover hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/signin" className="text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
