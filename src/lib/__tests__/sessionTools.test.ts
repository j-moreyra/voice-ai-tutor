import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ──────────────────────────────────────────────────────

function createChainableQuery(result: { data?: unknown; error?: unknown } = { data: null }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'order', 'limit', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown }
}

let fromCalls: Array<{ table: string; chain: ReturnType<typeof createChainableQuery> }>

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain = createChainableQuery({ data: null, error: null })
      fromCalls.push({ table, chain })
      return chain
    },
  },
}))

import { createSessionToolHandler } from '../sessionTools'

beforeEach(() => {
  vi.restoreAllMocks()
  fromCalls = []
})

describe('createSessionToolHandler', () => {
  const userId = 'user-abc'
  const sessionId = 'sess-123'

  it('returns a function', () => {
    const handler = createSessionToolHandler(userId, sessionId)
    expect(typeof handler).toBe('function')
  })

  it('returns ok when called with empty params', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    const result = await handler({})
    expect(result).toBe('ok')
    expect(fromCalls).toHaveLength(0)
  })

  it('upserts mastery_state individually for concept_updates', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    const result = await handler({
      concept_updates: [
        { concept_id: 'c1', status: 'mastered' },
        { concept_id: 'c2', status: 'struggling' },
      ],
    })
    expect(result).toBe('ok')

    // mastered and struggling need in_progress first, so 2 concepts × 2 calls each = 4
    const masteryCalls = fromCalls.filter((c) => c.table === 'mastery_state')
    expect(masteryCalls).toHaveLength(4)

    // First concept: in_progress then mastered
    expect(masteryCalls[0].chain.upsert).toHaveBeenCalledWith(
      { concept_id: 'c1', user_id: userId, status: 'in_progress' },
      { onConflict: 'concept_id,user_id', ignoreDuplicates: true }
    )
    expect(masteryCalls[1].chain.upsert).toHaveBeenCalledWith(
      { concept_id: 'c1', user_id: userId, status: 'mastered' },
      { onConflict: 'concept_id,user_id' }
    )

    // Second concept: in_progress then struggling
    expect(masteryCalls[2].chain.upsert).toHaveBeenCalledWith(
      { concept_id: 'c2', user_id: userId, status: 'in_progress' },
      { onConflict: 'concept_id,user_id', ignoreDuplicates: true }
    )
    expect(masteryCalls[3].chain.upsert).toHaveBeenCalledWith(
      { concept_id: 'c2', user_id: userId, status: 'struggling' },
      { onConflict: 'concept_id,user_id' }
    )
  })

  it('does not insert intermediate in_progress for in_progress updates', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    await handler({
      concept_updates: [{ concept_id: 'c1', status: 'in_progress' }],
    })

    const masteryCalls = fromCalls.filter((c) => c.table === 'mastery_state')
    expect(masteryCalls).toHaveLength(1)
    expect(masteryCalls[0].chain.upsert).toHaveBeenCalledWith(
      { concept_id: 'c1', user_id: userId, status: 'in_progress' },
      { onConflict: 'concept_id,user_id' }
    )
  })

  it('upserts session_sections_completed for section_completed', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    await handler({ section_completed: 'sec-1' })
    const sectionCall = fromCalls.find((c) => c.table === 'session_sections_completed')
    expect(sectionCall).toBeDefined()
    expect(sectionCall!.chain.upsert).toHaveBeenCalledWith(
      {
        session_id: sessionId,
        section_id: 'sec-1',
        user_id: userId,
      },
      { onConflict: 'session_id,section_id' }
    )
  })

  it('upserts chapter_results for chapter_result', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    await handler({
      chapter_result: { chapter_id: 'ch-1', result: 'mastered' },
    })
    const resultCall = fromCalls.find((c) => c.table === 'chapter_results')
    expect(resultCall).toBeDefined()
    expect(resultCall!.chain.upsert).toHaveBeenCalledWith(
      {
        chapter_id: 'ch-1',
        user_id: userId,
        result: 'mastered',
      },
      { onConflict: 'chapter_id,user_id' }
    )
  })

  it('updates session position', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    await handler({
      position: {
        chapter_id: 'ch-1',
        section_id: 'sec-1',
        concept_id: 'c-1',
      },
    })
    const positionCall = fromCalls.find((c) => c.table === 'sessions')
    expect(positionCall).toBeDefined()
    expect(positionCall!.chain.update).toHaveBeenCalledWith({
      current_chapter_id: 'ch-1',
      current_section_id: 'sec-1',
      current_concept_id: 'c-1',
    })
    expect(positionCall!.chain.eq).toHaveBeenCalledWith('id', sessionId)
  })

  it('handles all params simultaneously', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    const result = await handler({
      concept_updates: [{ concept_id: 'c1', status: 'in_progress' }],
      section_completed: 'sec-2',
      chapter_result: { chapter_id: 'ch-3', result: 'not_mastered' },
      position: { chapter_id: 'ch-3', section_id: 'sec-2', concept_id: 'c1' },
    })
    expect(result).toBe('ok')
    const tables = fromCalls.map((c) => c.table).sort()
    expect(tables).toEqual(['chapter_results', 'chapters', 'mastery_state', 'sections', 'session_sections_completed', 'sessions'])
  })

  it('skips concept_updates when array is empty', async () => {
    const handler = createSessionToolHandler(userId, sessionId)
    await handler({ concept_updates: [] })
    expect(fromCalls).toHaveLength(0)
  })

  it('returns ok even on exception to keep session alive', async () => {
    // Override the mock to throw
    const supabaseMod = await import('../supabase')
    const originalFrom = supabaseMod.supabase.from
    supabaseMod.supabase.from = () => { throw new Error('DB down') }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = createSessionToolHandler(userId, sessionId)
    const result = await handler({
      concept_updates: [{ concept_id: 'c1', status: 'mastered' }],
    })
    // Always returns 'ok' to keep the ElevenLabs session alive
    expect(result).toBe('ok')
    expect(warnSpy).toHaveBeenCalledWith(
      'Mastery update exception for c1:',
      expect.any(Error)
    )

    // Restore
    supabaseMod.supabase.from = originalFrom
    warnSpy.mockRestore()
  })

  it('returns ok even when outer try/catch fires', async () => {
    // Override the mock to throw for a non-concept operation
    const supabaseMod = await import('../supabase')
    const originalFrom = supabaseMod.supabase.from
    supabaseMod.supabase.from = () => { throw new Error('DB down') }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = createSessionToolHandler(userId, sessionId)
    const result = await handler({
      section_completed: 'sec-1',
    })
    expect(result).toBe('ok')
    expect(consoleSpy).toHaveBeenCalledWith(
      'Session tool handler error:',
      expect.any(Error)
    )

    // Restore
    supabaseMod.supabase.from = originalFrom
    consoleSpy.mockRestore()
  })
})
