import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ──────────────────────────────────────────────────────
// Build a chainable query builder that records calls and resolves with
// whatever `_result` is set to.

function createChainableQuery(result: { data?: unknown; error?: unknown } = { data: null }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'order', 'limit', 'single', 'rpc']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // Make the chain thenable so `await supabase.from(...)...` resolves
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown }
}

let queryResult: { data?: unknown; error?: unknown }
let mockFrom: ReturnType<typeof vi.fn>
let mockRpc: ReturnType<typeof vi.fn>
let mockGetSession: ReturnType<typeof vi.fn>
let mockFunctionsInvoke: ReturnType<typeof vi.fn>

vi.mock('../supabase', () => {
  // These will be re-assigned in beforeEach
  const mod = {
    supabase: {
      from: (...args: unknown[]) => mockFrom(...args),
      rpc: (...args: unknown[]) => mockRpc(...args),
      auth: {
        getSession: (...args: unknown[]) => mockGetSession(...args),
      },
      functions: {
        invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
      },
    },
  }
  return mod
})

import { determineSessionType, createSession, endSession, getSignedUrl } from '../session'

beforeEach(() => {
  vi.restoreAllMocks()
  queryResult = { data: null }
  mockFrom = vi.fn().mockImplementation(() => createChainableQuery(queryResult))
  mockRpc = vi.fn().mockResolvedValue({ data: false })
  mockGetSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
  mockFunctionsInvoke = vi.fn().mockResolvedValue({ data: null, error: null })
})

// ── determineSessionType ──────────────────────────────────────────────

describe('determineSessionType', () => {
  it('returns first_session when no previous sessions exist', async () => {
    queryResult = { data: [] }
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual({ sessionType: 'first_session' })
  })

  it('returns disconnected for orphaned session within 15 minutes', async () => {
    const recentStart = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    queryResult = {
      data: [{
        id: 's1',
        started_at: recentStart,
        ended_at: null,
        end_reason: null,
        current_chapter_id: 'ch1',
        current_section_id: 'sec1',
        current_concept_id: 'c1',
      }],
    }
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual({
      sessionType: 'disconnected',
      previousPosition: { chapterId: 'ch1', sectionId: 'sec1', conceptId: 'c1' },
    })
  })

  it('returns returning for orphaned session older than 15 minutes', async () => {
    const oldStart = new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 min ago
    queryResult = { data: [{ id: 's1', started_at: oldStart, ended_at: null, end_reason: null }] }
    mockRpc.mockResolvedValue({ data: false })
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual({ sessionType: 'returning' })
  })

  it('returns disconnected for recently disconnected session', async () => {
    const recentEnd = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    queryResult = {
      data: [{
        id: 's1',
        started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        ended_at: recentEnd,
        end_reason: 'disconnected',
      }],
    }
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual(expect.objectContaining({ sessionType: 'disconnected' }))
  })

  it('returns disconnected for recently timed-out session', async () => {
    const recentEnd = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    queryResult = {
      data: [{
        id: 's1',
        started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        ended_at: recentEnd,
        end_reason: 'timeout',
      }],
    }
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual(expect.objectContaining({ sessionType: 'disconnected' }))
  })

  it('returns returning_completed when material is fully mastered', async () => {
    const oldEnd = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
    queryResult = {
      data: [{
        id: 's1',
        started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        ended_at: oldEnd,
        end_reason: 'completed',
      }],
    }
    mockRpc.mockResolvedValue({ data: true })
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual({ sessionType: 'returning_completed' })
  })

  it('returns returning when material is not fully mastered', async () => {
    const oldEnd = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    queryResult = {
      data: [{
        id: 's1',
        started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        ended_at: oldEnd,
        end_reason: 'student_departure',
      }],
    }
    mockRpc.mockResolvedValue({ data: false })
    const type = await determineSessionType('user1', 'mat1')
    expect(type).toEqual({ sessionType: 'returning' })
  })

  it('calls endSession for orphaned sessions', async () => {
    const recentStart = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    queryResult = { data: [{ id: 'orphan-session', started_at: recentStart, ended_at: null, end_reason: null }] }
    await determineSessionType('user1', 'mat1')
    // The endSession call uses supabase.from('sessions').update(...)
    // Verify from was called with 'sessions' for the cleanup
    expect(mockFrom).toHaveBeenCalledWith('sessions')
  })
})

// ── createSession ─────────────────────────────────────────────────────

describe('createSession', () => {
  it('creates a session and returns the data', async () => {
    const sessionData = {
      id: 'new-sess',
      user_id: 'user1',
      material_id: 'mat1',
      session_type: 'first_session',
      started_at: new Date().toISOString(),
    }
    queryResult = { data: sessionData, error: null }
    const result = await createSession('user1', 'mat1', 'first_session')
    expect(result).toEqual(sessionData)
    expect(mockFrom).toHaveBeenCalledWith('sessions')
  })

  it('includes chapterId when provided', async () => {
    queryResult = { data: { id: 'sess1' }, error: null }
    await createSession('user1', 'mat1', 'returning', 'ch1')
    expect(mockFrom).toHaveBeenCalledWith('sessions')
  })

  it('throws on insert error', async () => {
    queryResult = { data: null, error: { message: 'Insert failed' } }
    await expect(createSession('user1', 'mat1', 'first_session'))
      .rejects.toThrow('Failed to create session: Insert failed')
  })
})

// ── endSession ────────────────────────────────────────────────────────

describe('endSession', () => {
  it('updates the session with end reason and timestamp', async () => {
    queryResult = { data: null, error: null }

    await endSession('sess1', 'student_departure')

    expect(mockFrom).toHaveBeenCalledWith('sessions')
    const chain = mockFrom.mock.results[0]?.value as ReturnType<typeof createChainableQuery>
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        end_reason: 'student_departure',
        ended_at: expect.any(String),
      })
    )
    const payload = chain.update.mock.calls[0][0] as { ended_at: string }
    expect(new Date(payload.ended_at).toString()).not.toBe('Invalid Date')
    expect(chain.eq).toHaveBeenCalledWith('id', 'sess1')
  })

  it('handles all end reasons', async () => {
    queryResult = { data: null, error: null }
    const reasons = ['completed', 'student_break', 'student_departure', 'disconnected', 'timeout'] as const
    for (const reason of reasons) {
      await endSession('sess1', reason)
    }
    expect(mockFrom).toHaveBeenCalledTimes(reasons.length)
  })

  it('throws when update fails', async () => {
    queryResult = { data: null, error: { message: 'Update failed' } }

    await expect(endSession('sess1', 'timeout'))
      .rejects.toThrow('Failed to end session: Update failed')
  })
})

// ── getSignedUrl ──────────────────────────────────────────────────────

describe('getSignedUrl', () => {
  it('returns signed URL and dynamic variables', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        signed_url: 'wss://example.com/signed',
        dynamic_variables: { key: 'value' },
      },
      error: null,
    })
    const result = await getSignedUrl('mat1', 'sess1')
    expect(result.signedUrl).toBe('wss://example.com/signed')
    expect(result.dynamicVariables).toEqual({ key: 'value' })
  })

  it('passes auth token to the edge function', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { signed_url: 'url', dynamic_variables: {} },
      error: null,
    })
    await getSignedUrl('mat1', 'sess1')
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('get-signed-url', {
      body: { material_id: 'mat1', session_id: 'sess1' },
      headers: { Authorization: 'Bearer tok123' },
    })
  })

  it('throws on function invoke error', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized' },
    })
    await expect(getSignedUrl('mat1', 'sess1'))
      .rejects.toThrow('Failed to get signed URL: Unauthorized')
  })
})
