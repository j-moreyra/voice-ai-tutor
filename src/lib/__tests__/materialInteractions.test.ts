import { describe, it, expect } from 'vitest'
import { canAttemptDelete, shouldShowUploadError } from '../materialInteractions'

describe('material interaction helpers', () => {
  it('allows delete only when user exists, not deleting, and confirmed', () => {
    expect(canAttemptDelete({ hasUser: true, deleting: false, confirmed: true })).toBe(true)
    expect(canAttemptDelete({ hasUser: false, deleting: false, confirmed: true })).toBe(false)
    expect(canAttemptDelete({ hasUser: true, deleting: true, confirmed: true })).toBe(false)
    expect(canAttemptDelete({ hasUser: true, deleting: false, confirmed: false })).toBe(false)
  })

  it('shows upload error only when present', () => {
    expect(shouldShowUploadError('failed')).toBe(true)
    expect(shouldShowUploadError(null)).toBe(false)
  })
})
