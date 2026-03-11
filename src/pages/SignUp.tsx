import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { EDUCATION_LEVELS } from '../types/database'
import type { EducationLevel } from '../types/database'

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

        <GoogleSignInButton onClick={async () => {
            const { error } = await signInWithGoogle()
            if (error) setError(error)
          }}
        />

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
