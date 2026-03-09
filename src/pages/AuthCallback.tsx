import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Listen for auth state changes (handles hash fragment parsing)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    })

    // Also check if session already exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    })

    // Fallback: if no auth event fires within 5s, redirect to signin
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      navigate('/signin', { replace: true })
    }, 5000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
    </div>
  )
}
