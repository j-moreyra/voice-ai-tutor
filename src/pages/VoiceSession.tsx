import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { determineSessionType, createSession, endSession, getSignedUrl } from '../lib/session'
import { createSessionToolHandler } from '../lib/sessionTools'
import { Conversation } from '@elevenlabs/client'
import SessionStatus from '../components/SessionStatus'
import type { EndReason } from '../types/database'

type Status = 'initializing' | 'connecting' | 'connected' | 'ended' | 'error'
type Mode = 'connecting' | 'listening' | 'speaking' | 'ended'

export default function VoiceSession() {
  const { materialId } = useParams<{ materialId: string }>()
  const [searchParams] = useSearchParams()
  const chapterId = searchParams.get('chapterId') ?? undefined
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('initializing')
  const [mode, setMode] = useState<Mode>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const navigate = useNavigate()
  const conversationRef = useRef<Conversation | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const endedRef = useRef(false)

  const stopMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
  }, [])

  const handleEnd = useCallback(
    async (reason: EndReason) => {
      if (endedRef.current) return
      endedRef.current = true

      try {
        if (conversationRef.current) {
          await conversationRef.current.endSession()
          conversationRef.current = null
        }
      } catch {
        // ignore cleanup errors
      }

      stopMediaStream()

      if (sessionIdRef.current) {
        await endSession(sessionIdRef.current, reason)
      }

      setStatus('ended')
      setMode('ended')
    },
    [stopMediaStream]
  )

  const handleBack = useCallback(async () => {
    await handleEnd('student_departure')
    navigate(`/study/${materialId}`)
  }, [handleEnd, navigate, materialId])

  useEffect(() => {
    if (!user || !materialId) return

    let cancelled = false

    async function start() {
      try {
        // Request mic permission early and store stream for cleanup
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        mediaStreamRef.current = stream

        if (cancelled) return

        // Determine session type and create session
        const sessionType = await determineSessionType(user!.id, materialId!)
        if (cancelled) return

        const session = await createSession(user!.id, materialId!, sessionType, chapterId)
        sessionIdRef.current = session.id
        if (cancelled) return

        // Get signed URL + dynamic variables from Edge Function
        setStatus('connecting')
        const { signedUrl, dynamicVariables } = await getSignedUrl(materialId!, session.id)
        if (cancelled) return

        // Create client tool handler
        const toolHandler = createSessionToolHandler(user!.id, session.id)

        // Start ElevenLabs conversation
        const conversation = await Conversation.startSession({
          signedUrl,
          dynamicVariables,
          clientTools: {
            update_session_state: toolHandler,
          },
          onConnect: () => {
            if (!cancelled) {
              setStatus('connected')
              setMode('listening')
            }
          },
          onDisconnect: () => {
            if (!cancelled && !endedRef.current) {
              handleEnd('disconnected')
            }
          },
          onModeChange: (newMode: { mode: string }) => {
            if (!cancelled) {
              setMode(newMode.mode === 'speaking' ? 'speaking' : 'listening')
            }
          },
          onError: (err: unknown) => {
            console.error('ElevenLabs error:', err)
            if (!cancelled && !endedRef.current) {
              setError('Connection error. Please try again.')
              handleEnd('disconnected')
            }
          },
        })

        if (cancelled) {
          await conversation.endSession()
          return
        }

        conversationRef.current = conversation
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access is required for voice sessions. Please allow microphone access and try again.'
            : `Failed to start session: ${(err as Error).message}`
        setError(message)
        setStatus('error')
      }
    }

    start()

    return () => {
      cancelled = true
      stopMediaStream()
      if (conversationRef.current && !endedRef.current) {
        handleEnd('student_departure')
      }
    }
  }, [user, materialId, handleEnd, stopMediaStream])

  const handleMuteToggle = () => {
    setMuted(!muted)
  }

  const handleEndClick = () => {
    handleEnd('student_departure')
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5">
        <div className="max-w-sm text-center animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft">
            <svg className="h-6 w-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary">{error}</p>
          <div className="mt-6 flex gap-3 justify-center">
            <Link
              to={`/study/${materialId}`}
              className="btn-press rounded-btn border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-border-bright hover:text-text"
            >
              Back to Study Plan
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="btn-press rounded-btn bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar - minimal */}
      <header className="flex items-center justify-between px-5 py-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <p className="text-sm font-medium text-text-secondary">Study Session</p>
        <div className="w-12" /> {/* Spacer for centering */}
      </header>

      {/* Center: mode indicator */}
      <main className="flex flex-1 items-center justify-center animate-fade-in">
        {status === 'ended' ? (
          <div className="text-center">
            <SessionStatus mode="ended" />
            <Link
              to={`/study/${materialId}`}
              className="btn-press mt-8 inline-block rounded-btn bg-accent px-6 py-3 text-sm font-medium text-white shadow-[0_0_20px_var(--color-accent-glow)] transition-all hover:bg-accent-hover"
            >
              Back to Study Plan
            </Link>
          </div>
        ) : (
          <SessionStatus mode={mode} />
        )}
      </main>

      {/* Bottom bar */}
      {status === 'connected' && (
        <footer className="flex items-center justify-between px-5 py-5">
          <button
            onClick={handleEndClick}
            className="text-sm text-text-muted transition-colors hover:text-danger"
          >
            End Session
          </button>

          <button
            onClick={handleMuteToggle}
            className={`btn-press rounded-full p-4 transition-all duration-200 ${
              muted
                ? 'bg-danger-soft text-danger'
                : 'bg-surface text-text-secondary hover:bg-surface-hover'
            }`}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 19 17.591 17.591 5.409 5.409 4 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 1-6-6v-1.5m12 1.5a6 6 0 0 1-.34 2.009M12 18.75V21m-4.773-4.227 1.591 1.591M12 1.5a3 3 0 0 1 3 3v6.118a3 3 0 0 1-.879 2.121M12 1.5a3 3 0 0 0-3 3v6" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            )}
          </button>

          <div className="w-16" /> {/* Spacer for centering mic button */}
        </footer>
      )}
    </div>
  )
}
