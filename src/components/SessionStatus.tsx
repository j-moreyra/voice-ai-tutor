type SessionMode = 'connecting' | 'listening' | 'speaking' | 'ended'

interface SessionStatusProps {
  mode: SessionMode
}

export default function SessionStatus({ mode }: SessionStatusProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {mode === 'connecting' && (
          <>
            <div className="absolute inset-0 animate-breathe rounded-full bg-accent/5" />
            <div className="h-16 w-16 animate-spin rounded-full border-[3px] border-border border-t-accent" />
          </>
        )}
        {mode === 'listening' && (
          <>
            {/* Outer pulse ring */}
            <div className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-accent/30" />
            {/* Main circle */}
            <div className="animate-breathe-fast flex h-24 w-24 items-center justify-center rounded-full bg-accent/10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
            </div>
          </>
        )}
        {mode === 'speaking' && (
          <>
            {/* Animated wave bars */}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-success/30 animate-wave"
                  style={{
                    height: '40px',
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: `${0.8 + i * 0.2}s`,
                  }}
                />
              ))}
            </div>
            {/* Center circle */}
            <div className="animate-breathe flex h-24 w-24 items-center justify-center rounded-full bg-success/10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
                <svg className="h-7 w-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              </div>
            </div>
          </>
        )}
        {mode === 'ended' && (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface">
            <svg className="h-10 w-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-text-secondary">
        {mode === 'connecting' && 'Connecting to your tutor...'}
        {mode === 'listening' && 'Listening...'}
        {mode === 'speaking' && 'Tutor is speaking...'}
        {mode === 'ended' && 'Session complete'}
      </p>
    </div>
  )
}
