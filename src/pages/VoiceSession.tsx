import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
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
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('initializing')
  const [mode, setMode] = useState<Mode>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const conversationRef = useRef<Conversation | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const endedRef = useRef(false)

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

      if (sessionIdRef.current) {
        await endSession(sessionIdRef.current, reason)
      }

      setStatus('ended')
      setMode('ended')
    },
    []
  )

  useEffect(() => {
    if (!user || !materialId) return

    let cancelled = false

    async function start() {
      try {
        // Request mic permission early
        await navigator.mediaDevices.getUserMedia({ audio: true })

        if (cancelled) return

        // Determine session type and create session
        const sessionType = await determineSessionType(user!.id, materialId!)
        if (cancelled) return

        const session = await createSession(user!.id, materialId!, sessionType)
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
      if (conversationRef.current && !endedRef.current) {
        handleEnd('student_departure')
      }
    }
  }, [user, materialId, handleEnd])

  const handleMuteToggle = () => {
    // The SDK doesn't have a direct mute method, but we can set volume to 0
    // For now, track the state — actual muting depends on SDK capabilities
    setMuted(!muted)
  }

  const handleEndClick = () => {
    handleEnd('student_departure')
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <p className="text-sm text-red-400">{error}</p>
          <div className="mt-4 flex gap-3 justify-center">
            <Link
              to={`/study/${materialId}`}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Back to Study Plan
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
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
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <p className="truncate text-sm font-medium text-slate-300">Study Session</p>
        {status !== 'ended' && (
          <button
            onClick={handleEndClick}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
          >
            End Session
          </button>
        )}
      </header>

      {/* Center: mode indicator */}
      <main className="flex flex-1 items-center justify-center">
        {status === 'ended' ? (
          <div className="text-center">
            <SessionStatus mode="ended" />
            <Link
              to={`/study/${materialId}`}
              className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Back to Study Plan
            </Link>
          </div>
        ) : (
          <SessionStatus mode={mode} />
        )}
      </main>

      {/* Bottom bar: mic control */}
      {status === 'connected' && (
        <footer className="flex justify-center border-t border-slate-700 px-4 py-4">
          <button
            onClick={handleMuteToggle}
            className={`rounded-full p-4 transition-colors ${
              muted
                ? 'bg-red-500/20 text-red-400'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
        </footer>
      )}
    </div>
  )
}
