import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { EducationLevel, Profile } from '../types/database'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  signUp: (email: string, password: string, firstName: string, educationLevel: EducationLevel) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) {
        setProfile(null)
        return
      }
      setProfile(data as Profile | null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let bootstrappedFromEvent = false

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        fetchProfile(nextSession.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    }

    // Listen for auth changes first so we don't miss events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        bootstrappedFromEvent = true
      }
      applySession(session)
    })

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Avoid double-initialization if INITIAL_SESSION already fired.
      if (bootstrappedFromEvent) return
      applySession(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    educationLevel: EducationLevel
  ): Promise<{ error: string | null }> => {
    const { data, error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      return { error: authError.message }
    }

    if (!data.user) {
      return { error: 'Sign up failed. Please try again.' }
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      first_name: firstName,
      education_level: educationLevel,
    })

    if (profileError) {
      return { error: `Account created but profile setup failed: ${profileError.message}` }
    }

    return { error: null }
  }

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { error: error.message }
    }
    return { error: null }
  }

  const signInWithGoogle = async (): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      return { error: error.message }
    }
    return { error: null }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, profileLoading, signUp, signIn, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
