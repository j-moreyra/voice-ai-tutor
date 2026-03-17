import { describe, it, expect } from 'vitest'
import { AUTH_CALLBACK_TIMEOUT_MS, shouldApplyGetSessionResult, hasSession } from '../authFlow'

describe('authFlow helpers', () => {
  it('uses 15s auth callback timeout', () => {
    expect(AUTH_CALLBACK_TIMEOUT_MS).toBe(15000)
  })

  it('applies getSession result only when not bootstrapped from event', () => {
    expect(shouldApplyGetSessionResult(true)).toBe(false)
    expect(shouldApplyGetSessionResult(false)).toBe(true)
  })

  it('detects session presence', () => {
    expect(hasSession(null)).toBe(false)
    expect(hasSession({ user: { id: 'u1' } } as never)).toBe(true)
  })
})
