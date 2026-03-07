type SessionMode = 'connecting' | 'listening' | 'speaking' | 'ended'

interface SessionStatusProps {
  mode: SessionMode
}

export default function SessionStatus({ mode }: SessionStatusProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex h-32 w-32 items-center justify-center">
        {mode === 'connecting' && (
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500" />
        )}
        {mode === 'listening' && (
          <div className="h-20 w-20 animate-pulse rounded-full bg-blue-500/20">
            <div className="flex h-full items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-blue-500/40" />
            </div>
          </div>
        )}
        {mode === 'speaking' && (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 ring-2 ring-green-500/50">
            <div className="h-12 w-12 animate-pulse rounded-full bg-green-500/30" />
          </div>
        )}
        {mode === 'ended' && (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-400">
        {mode === 'connecting' && 'Connecting...'}
        {mode === 'listening' && 'Listening...'}
        {mode === 'speaking' && 'Tutor is speaking...'}
        {mode === 'ended' && 'Session ended'}
      </p>
    </div>
  )
}
