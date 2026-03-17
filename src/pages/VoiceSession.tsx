import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { determineSessionType, createSession, endSession, getSignedUrl } from '../lib/session'
import { createSessionToolHandler } from '../lib/sessionTools'
import { Conversation } from '@elevenlabs/client'
import SessionStatus from '../components/SessionStatus'
import type { EndReason } from '../types/database'
import type { MessagePayload } from '@elevenlabs/types'
import {
  mergeTranscriptMessage,
  parseTentativeAgentDebugMessage,
  getNextStreamingTentativeText,
} from '../lib/voiceTranscript'
import type { TranscriptMessage } from '../lib/voiceTranscript'

type Status = 'initializing' | 'connecting' | 'connected' | 'ended' | 'error'
type Mode = 'connecting' | 'listening' | 'speaking' | 'ended'
export default function VoiceSession() {
  const { materialId } = useParams<{ materialId: string }>()
  const [searchParams] = useSearchParams()
  const chapterId = searchParams.get('chapterId') ?? undefined
  const sectionId = searchParams.get('sectionId') ?? undefined
  const chapterName = searchParams.get('chapter') ?? undefined
  const sectionName = searchParams.get('section') ?? undefined
  // Voice speed override (requires TTS overrides enabled in ElevenLabs dashboard:
  // Agent → Settings → Security tab → enable overrides for TTS/Voice settings)
  const speedParam = parseFloat(searchParams.get('speed') ?? '1.0') || 1.0
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('initializing')
  const [mode, setMode] = useState<Mode>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])

  const navigate = useNavigate()
  const conversationRef = useRef<Conversation | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const endedRef = useRef(false)
  const connectedAtRef = useRef<number | null>(null)
  // How many times we've connected (0 = never, 1 = first, 2+ = after pause/resume)
  const connectCountRef = useRef(0)
  const statusRef = useRef<Status>('initializing')
  // Grace period: don't tear down the session immediately on disconnect.
  // Give the WebSocket 5 seconds to reconnect (e.g. after a tab switch).
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disconnectedAtRef = useRef<number>(0)
  // Track when the tab is backgrounded so we don't treat transient
  // WebSocket drops (caused by the browser throttling background tabs)
  // as real disconnects.
  const visibilityHiddenRef = useRef(false)
  const lastHiddenAtRef = useRef<number>(0)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [transcript])

  const agentTentativeTargetRef = useRef<string>('')
  const agentTentativeCurrentRef = useRef<string>('')
  const agentTentativeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAgentTentativeStreaming = useCallback(() => {
    if (agentTentativeTimerRef.current) {
      clearInterval(agentTentativeTimerRef.current)
      agentTentativeTimerRef.current = null
    }
    agentTentativeTargetRef.current = ''
    agentTentativeCurrentRef.current = ''
  }, [])

  const queueAgentTentativeStreaming = useCallback((text: string) => {
    const normalizedTarget = text.trim()
    if (!normalizedTarget) return

    agentTentativeTargetRef.current = normalizedTarget

    if (agentTentativeCurrentRef.current) {
      const currentAsText = agentTentativeCurrentRef.current.trim()
      if (currentAsText && !normalizedTarget.startsWith(currentAsText)) {
        agentTentativeCurrentRef.current = ''
      }
    }

    if (agentTentativeTimerRef.current) return

    agentTentativeTimerRef.current = setInterval(() => {
      const target = agentTentativeTargetRef.current
      if (!target) {
        stopAgentTentativeStreaming()
        return
      }

      const nextText = getNextStreamingTentativeText(agentTentativeCurrentRef.current, target)
      if (!nextText) {
        stopAgentTentativeStreaming()
        return
      }

      if (nextText !== agentTentativeCurrentRef.current) {
        agentTentativeCurrentRef.current = nextText
        setTranscript((prev) =>
          mergeTranscriptMessage(prev, { source: 'ai', role: 'agent', message: nextText })
        )
      }

      if (nextText === target) {
        if (agentTentativeTimerRef.current) {
          clearInterval(agentTentativeTimerRef.current)
          agentTentativeTimerRef.current = null
        }
      }
    }, 75)
  }, [stopAgentTentativeStreaming])

  const handleMessage = useCallback((payload: MessagePayload) => {
    if (payload.role === 'agent' && payload.event_id == null) {
      queueAgentTentativeStreaming(payload.message)
      return
    }

    if (payload.role === 'agent' && payload.event_id != null) {
      stopAgentTentativeStreaming()
    }

    setTranscript((prev) => mergeTranscriptMessage(prev, payload))
  }, [queueAgentTentativeStreaming, stopAgentTentativeStreaming])

  useEffect(() => {
    return () => {
      stopAgentTentativeStreaming()
    }
  }, [stopAgentTentativeStreaming])

  // Track tab visibility so we can distinguish real disconnects from
  // browser-throttled background tab drops.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        visibilityHiddenRef.current = true
        lastHiddenAtRef.current = Date.now()
      } else {
        visibilityHiddenRef.current = false
        // If there was a recent disconnect (within 10s) and we haven't
        // torn down yet, cancel the pending teardown — the tab is back.
        const timeSinceDisconnect = Date.now() - disconnectedAtRef.current
        if (disconnectTimerRef.current && timeSinceDisconnect < 10000) {
          clearTimeout(disconnectTimerRef.current)
          disconnectTimerRef.current = null
          console.info('Tab visible again — cancelled pending disconnect teardown')
        }
        // Send a contextual update to signal activity and prevent
        // ElevenLabs turn timeout from firing.
        conversationRef.current?.sendContextualUpdate(
          'The student switched back to this tab. Continue the conversation normally.'
        )
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

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

      stopAgentTentativeStreaming()
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
    [stopMediaStream, stopAgentTentativeStreaming]
  )

  const handleBack = useCallback(async () => {
    await handleEnd('student_departure')
    navigate(`/study/${materialId}`)
  }, [handleEnd, navigate, materialId])

  // Starts an ElevenLabs conversation for the current session.
  const connectConversationRef = useRef<(cancelled: { current: boolean }) => Promise<void>>()
  connectConversationRef.current = async (cancelled: { current: boolean }) => {
    if (!user || !materialId || !sessionIdRef.current) return

    const { signedUrl, dynamicVariables } = await getSignedUrl(materialId, sessionIdRef.current)
    if (cancelled.current) return

    const toolHandler = createSessionToolHandler(user.id, sessionIdRef.current)

    const conversation = await Conversation.startSession({
      signedUrl,
      dynamicVariables,
      ...(speedParam !== 1 ? { overrides: { tts: { speed: speedParam } } } : {}),
      clientTools: {
        update_session_state: toolHandler,
      },
      workletPaths: {
        rawAudioProcessor: '/elevenlabs/rawAudioProcessor.js',
        audioConcatProcessor: '/elevenlabs/audioConcatProcessor.js',
      },
      onConnect: () => {
        if (!cancelled.current) {
          // Cancel any pending disconnect teardown — the connection recovered.
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current)
            disconnectTimerRef.current = null
            console.info('Connection recovered — cancelled pending disconnect teardown')
          }
          connectedAtRef.current = Date.now()
          connectCountRef.current += 1
          setStatus('connected')
          setMode('listening')
          setMuted(false)
        }
      },
      onDisconnect: () => {
        if (cancelled.current || endedRef.current) return
        if (statusRef.current !== 'connected') return

        // Never tear down immediately. Record when the disconnect happened
        // and start a 5-second grace period. If onConnect fires again
        // within that window (e.g. after a tab switch), the timer is
        // cancelled and the session continues uninterrupted.
        disconnectedAtRef.current = Date.now()
        console.warn('Disconnect detected — starting 5s grace period before teardown')

        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current)
        disconnectTimerRef.current = setTimeout(() => {
          disconnectTimerRef.current = null
          if (endedRef.current || cancelled.current) return

          const connectedDuration = connectedAtRef.current
            ? (Date.now() - connectedAtRef.current) / 1000
            : 0

          endedRef.current = true
          stopAgentTentativeStreaming()
          stopMediaStream()
          if (sessionIdRef.current) {
            endSession(sessionIdRef.current, 'disconnected').catch(() => {})
          }

          // First connection dropping within 30s = likely credits/config.
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
        }, 5000)
      },
      onModeChange: (newMode: { mode: string }) => {
        if (!cancelled.current) {
          const resolved = newMode.mode === 'speaking' ? 'speaking' : 'listening'
          setMode(resolved)
        }
      },
      onMessage: handleMessage,
      onDebug: (payload: unknown) => {
        const tentativeMessage = parseTentativeAgentDebugMessage(payload)
        if (tentativeMessage) queueAgentTentativeStreaming(tentativeMessage.message)
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

        const { sessionType, previousPosition } = await determineSessionType(user!.id, materialId!)
        if (cancelled.current) return

        // On disconnect, carry forward the position from the old session so the
        // edge function can tell the AI exactly where the student left off.
        const resumeChapterId = chapterId ?? previousPosition?.chapterId ?? undefined
        const resumeSectionId = sectionId ?? previousPosition?.sectionId ?? undefined
        const resumeConceptId = previousPosition?.conceptId ?? undefined

        const session = await createSession(user!.id, materialId!, sessionType, resumeChapterId, resumeSectionId, resumeConceptId)
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
      // Don't tear down the session if the tab is just being hidden/suspended.
      // Only explicit user actions (Back button) should end the session.
      if (document.hidden) return

      cancelled.current = true
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current)
        disconnectTimerRef.current = null
      }
      stopAgentTentativeStreaming()
      stopMediaStream()
      if (conversationRef.current && !endedRef.current) {
        handleEnd('student_departure')
      }
    }
  }, [user, materialId, speedParam, handleEnd, stopMediaStream, handleMessage, stopAgentTentativeStreaming])

  const setMicEnabled = (enabled: boolean) => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  const handleMuteToggle = () => {
    const next = !muted
    setMuted(next)
    setMicEnabled(!next)
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
        <div className="text-center">
          <p className="text-sm font-medium text-text-secondary">Study Session</p>
          {chapterName && (
            <p className="mt-0.5 text-sm text-text-muted">{chapterName}</p>
          )}
          {sectionName && (
            <p className="text-sm text-text-muted">{sectionName}</p>
          )}
        </div>
        <div className="w-12" /> {/* Spacer for centering */}
      </header>

      {/* Center: mode indicator + live transcript */}
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 pb-6 animate-fade-in">
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
            <SessionStatus mode={mode} />
          </div>
        )}

        {status !== 'ended' && (
          <section className="w-full max-w-2xl rounded-2xl border border-border bg-surface/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-text-secondary">Live captions</p>
              <p className="text-xs text-text-muted">Streaming word-by-word</p>
            </div>

            <div aria-live="polite" aria-atomic="false" className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {transcript.length === 0 ? (
                <p className="text-sm text-text-muted">Transcript will appear here once the conversation starts.</p>
              ) : (
                transcript.map((msg) => {
                  const isTutor = msg.role === 'agent'
                  return (
                    <div key={msg.id} className={`flex ${isTutor ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          isTutor
                            ? 'bg-accent-soft text-text'
                            : 'bg-muted text-text'
                        } ${msg.tentative ? 'opacity-70 italic' : ''}`}
                      >
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">
                          {isTutor ? 'Tutor' : 'Student'}
                        </p>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={transcriptEndRef} />
            </div>
          </section>
        )}
      </main>

      {/* Bottom bar */}
      {status === 'connected' && (
        <footer className="flex items-center justify-center gap-6 px-5 py-5">
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
        </footer>
      )}
    </div>
  )
}
