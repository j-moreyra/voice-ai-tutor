import type { Session } from '@supabase/supabase-js'

export const AUTH_CALLBACK_TIMEOUT_MS = 15000

export function shouldApplyGetSessionResult(bootstrappedFromEvent: boolean): boolean {
  return !bootstrappedFromEvent
}

export function hasSession(session: Session | null): boolean {
  return Boolean(session)
}
