import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { determineSessionType, createSession, endSession, getSignedUrl } from '../lib/session'
import { createSessionToolHandler } from '../lib/sessionTools'
import { Conversation } from '@elevenlabs/client'
import SessionStatus from '../components/SessionStatus'
import type { EndReason } from '../types/database'

type Status = 'initializing' | 'connecting' | 'connected' | 'resuming' | 'ended' | 'error'
type Mode = 'connecting' | 'listening' | 'speaking' | 'ended'

export default function VoiceSession() {
  const { materialId } = useParams<{ materialId: string }>()
  const [searchParams] = useSearchParams()
  const chapterId = searchParams.get('chapterId') ?? undefined
  const sectionId = searchParams.get('sectionId') ?? undefined
  // Voice speed override (requires TTS overrides enabled in ElevenLabs dashboard:
  // Agent → Settings → Security tab → enable overrides for TTS/Voice settings)
  const speedParam = parseFloat(searchParams.get('speed') ?? '1.0') || 1.0
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('initializing')
  const [mode, setMode] = useState<Mode>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)

  const navigate = useNavigate()
  const conversationRef = useRef<Conversation | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const endedRef = useRef(false)
  const pausedRef = useRef(false)
  const connectedAtRef = useRef<number | null>(null)
  // How many times we've connected (0 = never, 1 = first, 2+ = after pause/resume)
  const connectCountRef = useRef(0)
  const statusRef = useRef<Status>('initializing')

  useEffect(() => {
    statusRef.current = status
  }, [status])

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

      try {
        if (sessionIdRef.current) {
          await endSession(sessionIdRef.current, reason)
        }
      } catch (err) {
        console.error('Failed to persist session end (non-fatal):', err)
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

  // Starts (or restarts) an ElevenLabs conversation for the current session.
  // Stored in a ref so it can be called from both the initial useEffect and
  // from handlePauseToggle without being a useEffect dependency (which would
  // cause the effect to re-fire and disconnect the conversation).
  const connectConversationRef = useRef<(cancelled: { current: boolean }, resume?: boolean) => Promise<void>>()
  connectConversationRef.current = async (cancelled: { current: boolean }, resume = false) => {
    if (!user || !materialId || !sessionIdRef.current) return

    const { signedUrl, dynamicVariables } = await getSignedUrl(materialId, sessionIdRef.current)
    if (cancelled.current) return

    // When resuming from pause, override session_type so the agent treats
    // this as a continuation — picking up from the last recorded position
    // instead of restarting from the beginning of the section.
    const vars = resume
      ? { ...dynamicVariables, session_type: 'disconnected' }
      : dynamicVariables

    const toolHandler = createSessionToolHandler(user.id, sessionIdRef.current)

    const conversation = await Conversation.startSession({
      signedUrl,
      dynamicVariables: vars,
      ...(speedParam !== 1 ? { overrides: { tts: { speed: speedParam } } } : {}),
      clientTools: {
        update_session_state: toolHandler,
      },
      onConnect: () => {
        if (!cancelled.current) {
          connectedAtRef.current = Date.now()
          connectCountRef.current += 1
          pausedRef.current = false
          setStatus('connected')
          setMode('listening')
          setPaused(false)
          setMuted(false)
        }
      },
      onDisconnect: () => {
        if (!cancelled.current && !endedRef.current && !pausedRef.current) {
          if (statusRef.current === 'connected' || statusRef.current === 'resuming') {
            const connectedDuration = connectedAtRef.current
              ? (Date.now() - connectedAtRef.current) / 1000
              : 0

            endedRef.current = true
            stopMediaStream()
            if (sessionIdRef.current) {
              endSession(sessionIdRef.current, 'disconnected').catch(() => {})
            }

            // First connection dropping within 30s = likely credits/config.
            // Reconnections (after pause/resume) dropping = connection issue.
            if (connectedDuration < 30 && connectCountRef.current <= 1) {
              setError(
                speedParam !== 1
                  ? 'The session failed to start with the selected voice speed. TTS overrides must be enabled in the ElevenLabs dashboard (Agent → Settings → Security → enable TTS overrides). Try again with default speed or enable overrides.'
                  : 'The session ended unexpectedly. This may be due to insufficient credits or a configuration issue. Please check your account and try again.'
              )
            } else {
              setError('The voice connection was lost. You can try again to reconnect.')
            }
            setStatus('error')
          }
        }
      },
      onModeChange: (newMode: { mode: string }) => {
        if (!cancelled.current) {
          const resolved = newMode.mode === 'speaking' ? 'speaking' : 'listening'
          setMode(resolved)
        }
      },
      onError: (err: unknown) => {
        console.error('ElevenLabs error:', err)
        if (!cancelled.current && !endedRef.current) {
          setError('Connection error. Please try again.')
          handleEnd('disconnected')
        }
      },
    })

    if (cancelled.current) {
      await conversation.endSession()
      return
    }

    conversationRef.current = conversation
  }

  useEffect(() => {
    if (!user || !materialId) return

    const cancelled = { current: false }

    async function start() {
      const timeoutId = setTimeout(() => {
        if (!cancelled.current && (statusRef.current === 'initializing' || statusRef.current === 'connecting')) {
          setError('Connection timed out. Please check your internet connection and try again.')
          setStatus('error')
          stopMediaStream()
        }
      }, 30000)

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        mediaStreamRef.current = stream
        if (cancelled.current) return

        const sessionType = await determineSessionType(user!.id, materialId!)
        if (cancelled.current) return

        const session = await createSession(user!.id, materialId!, sessionType, chapterId, sectionId)
        sessionIdRef.current = session.id
        if (cancelled.current) return

        setStatus('connecting')
        await connectConversationRef.current!(cancelled)
      } catch (err) {
        if (cancelled.current) return
        if (sessionIdRef.current) {
          endSession(sessionIdRef.current, 'disconnected').catch(() => {})
        }
        stopMediaStream()
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access is required for voice sessions. Please allow microphone access and try again.'
            : `Failed to start session: ${(err as Error).message}`
        setError(message)
        setStatus('error')
      } finally {
        clearTimeout(timeoutId)
      }
    }

    start()

    return () => {
      cancelled.current = true
      stopMediaStream()
      if (conversationRef.current && !endedRef.current) {
        handleEnd('student_departure')
      }
    }
  }, [user, materialId, speedParam, handleEnd, stopMediaStream])

  const setMicEnabled = (enabled: boolean) => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  const handlePauseToggle = async () => {
    if (paused) {
      // Unpause — reconnect to ElevenLabs with fresh signed URL.
      // The Edge Function reads current position/mastery from the DB,
      // so the agent picks up exactly where the student left off.
      setStatus('resuming')
      setMode('connecting')
      try {
        await connectConversationRef.current!({ current: false }, true)
      } catch (err) {
        console.error('Failed to resume:', err)
        setError('Failed to resume session. Please try again.')
        setStatus('error')
      }
      return
    }

    // Pause — fully disconnect ElevenLabs so the agent stops completely.
    // No speech, no progression, no tool calls — a true pause.
    pausedRef.current = true
    setPaused(true)
    setMuted(true)
    setMicEnabled(false)
    try {
      if (conversationRef.current) {
        await conversationRef.current.endSession()
        conversationRef.current = null
      }
    } catch {
      // ignore cleanup errors
    }
  }

  const handleMuteToggle = () => {
    if (paused) return
    const next = !muted
    setMuted(next)
    setMicEnabled(!next)
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
          <div className="text-center">
            <SessionStatus mode={paused ? 'listening' : mode} />
            {status === 'resuming' && !paused && (
              <p className="mt-4 text-sm text-accent animate-pulse">Resuming...</p>
            )}
            {paused && (
              <p className="mt-4 text-sm text-warning animate-pulse">Paused</p>
            )}
          </div>
        )}
      </main>

      {/* Bottom bar */}
      {(status === 'connected' || status === 'resuming' || paused) && (
        <footer className="flex items-center justify-center gap-6 px-5 py-5">
          <button
            onClick={handleEndClick}
            className="text-sm text-text-muted transition-colors hover:text-danger"
          >
            End Session
          </button>

          <button
            onClick={handlePauseToggle}
            disabled={status === 'resuming'}
            className={`btn-press flex flex-col items-center justify-center rounded-full transition-all duration-200 ${
              paused
                ? 'h-14 w-14 bg-warning/20 text-warning'
                : status === 'resuming'
                  ? 'h-14 w-14 bg-accent/20 text-accent animate-pulse'
                  : 'h-14 w-14 bg-surface-hover text-text-secondary'
            }`}
            title={paused ? 'Resume' : status === 'resuming' ? 'Resuming...' : 'Pause'}
          >
            {paused ? (
              /* Play icon */
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7Z" />
              </svg>
            ) : (
              /* Pause icon */
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleMuteToggle}
            disabled={paused || status === 'resuming'}
            className={`btn-press rounded-full p-4 transition-all duration-200 ${
              paused || status === 'resuming'
                ? 'cursor-not-allowed opacity-40 bg-surface text-text-muted'
                : muted
                  ? 'bg-danger-soft text-danger'
                  : 'bg-surface text-text-secondary hover:bg-surface-hover'
            }`}
            title={paused ? 'Mute (paused)' : muted ? 'Unmute' : 'Mute'}
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
