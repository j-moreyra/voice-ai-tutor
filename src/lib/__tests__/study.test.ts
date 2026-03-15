import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ──────────────────────────────────────────────────────

function createChainableQuery(result: { data?: unknown; error?: unknown } = { data: null }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'limit', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

let fromResults: Record<string, { data?: unknown; error?: unknown }>
let mockChannel: Record<string, ReturnType<typeof vi.fn>>
let mockRemoveChannel: ReturnType<typeof vi.fn>

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const result = fromResults[table] ?? { data: null }
      return createChainableQuery(result)
    },
    channel: (..._args: unknown[]) => mockChannel,
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}))

import { fetchStudyPlan, subscribeStudyPlan } from '../study'

beforeEach(() => {
  vi.restoreAllMocks()
  fromResults = {}
  mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  } as unknown as Record<string, ReturnType<typeof vi.fn>>
  mockRemoveChannel = vi.fn()
})

// ── fetchStudyPlan ────────────────────────────────────────────────────

describe('fetchStudyPlan', () => {
  it('returns null when material is not found', async () => {
    fromResults.materials = { data: null }
    fromResults.chapters = { data: [] }
    fromResults.sections = { data: [] }
    fromResults.concepts = { data: [] }
    fromResults.mastery_state = { data: [] }
    fromResults.chapter_results = { data: [] }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result).toBeNull()
  })

  it('returns study plan with correct hierarchy', async () => {
    fromResults.materials = { data: { id: 'mat1', file_name: 'test.pdf', user_id: 'user1' } }
    fromResults.chapters = { data: [
      { id: 'ch1', material_id: 'mat1', title: 'Chapter 1', sort_order: 0 },
    ] }
    fromResults.sections = { data: [
      { id: 's1', chapter_id: 'ch1', title: 'Section 1', sort_order: 0 },
    ] }
    fromResults.concepts = { data: [
      { id: 'c1', section_id: 's1', title: 'Concept 1', sort_order: 0 },
      { id: 'c2', section_id: 's1', title: 'Concept 2', sort_order: 1 },
    ] }
    fromResults.mastery_state = { data: [
      { concept_id: 'c1', user_id: 'user1', status: 'mastered' },
    ] }
    fromResults.chapter_results = { data: [] }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result).not.toBeNull()
    expect(result!.material.id).toBe('mat1')
    expect(result!.chapters).toHaveLength(1)
    expect(result!.chapters[0].sections).toHaveLength(1)
    expect(result!.chapters[0].sections[0].concepts).toHaveLength(2)
  })

  it('maps mastery status correctly to concepts', async () => {
    fromResults.materials = { data: { id: 'mat1' } }
    fromResults.chapters = { data: [{ id: 'ch1', material_id: 'mat1', sort_order: 0 }] }
    fromResults.sections = { data: [{ id: 's1', chapter_id: 'ch1', sort_order: 0 }] }
    fromResults.concepts = { data: [
      { id: 'c1', section_id: 's1', sort_order: 0 },
      { id: 'c2', section_id: 's1', sort_order: 1 },
      { id: 'c3', section_id: 's1', sort_order: 2 },
    ] }
    fromResults.mastery_state = { data: [
      { concept_id: 'c1', user_id: 'user1', status: 'mastered' },
      { concept_id: 'c2', user_id: 'user1', status: 'struggling' },
    ] }
    fromResults.chapter_results = { data: [] }

    const result = await fetchStudyPlan('user1', 'mat1')
    const concepts = result!.chapters[0].sections[0].concepts

    expect(concepts[0].mastery).toBe('mastered')
    expect(concepts[1].mastery).toBe('struggling')
    expect(concepts[2].mastery).toBe('not_started') // default
  })

  it('maps chapter results correctly', async () => {
    fromResults.materials = { data: { id: 'mat1' } }
    fromResults.chapters = { data: [
      { id: 'ch1', material_id: 'mat1', sort_order: 0 },
      { id: 'ch2', material_id: 'mat1', sort_order: 1 },
    ] }
    fromResults.sections = { data: [] }
    fromResults.concepts = { data: [] }
    fromResults.mastery_state = { data: [] }
    fromResults.chapter_results = { data: [
      { chapter_id: 'ch1', user_id: 'user1', result: 'mastered' },
    ] }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result!.chapters[0].result).toBe('mastered')
    expect(result!.chapters[1].result).toBeNull()
  })

  it('computes stats correctly with all mastery statuses', async () => {
    fromResults.materials = { data: { id: 'mat1' } }
    fromResults.chapters = { data: [{ id: 'ch1', material_id: 'mat1', sort_order: 0 }] }
    fromResults.sections = { data: [{ id: 's1', chapter_id: 'ch1', sort_order: 0 }] }
    fromResults.concepts = { data: [
      { id: 'c1', section_id: 's1', sort_order: 0 },
      { id: 'c2', section_id: 's1', sort_order: 1 },
      { id: 'c3', section_id: 's1', sort_order: 2 },
      { id: 'c4', section_id: 's1', sort_order: 3 },
      { id: 'c5', section_id: 's1', sort_order: 4 },
      { id: 'c6', section_id: 's1', sort_order: 5 },
    ] }
    fromResults.mastery_state = { data: [
      { concept_id: 'c1', status: 'mastered' },
      { concept_id: 'c2', status: 'in_progress' },
      { concept_id: 'c3', status: 'struggling' },
      { concept_id: 'c4', status: 'skipped' },
      // c5: not_started (no entry), c6: not_started
    ] }
    fromResults.chapter_results = { data: [] }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result!.stats).toEqual({
      total: 6,
      mastered: 1,
      inProgress: 1,
      struggling: 1,
      skipped: 1,
      notStarted: 2,
    })
  })

  it('computes stats as all zeros when no concepts exist', async () => {
    fromResults.materials = { data: { id: 'mat1' } }
    fromResults.chapters = { data: [{ id: 'ch1', material_id: 'mat1', sort_order: 0 }] }
    fromResults.sections = { data: [] }
    fromResults.concepts = { data: [] }
    fromResults.mastery_state = { data: [] }
    fromResults.chapter_results = { data: [] }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result!.stats.total).toBe(0)
    expect(result!.stats.mastered).toBe(0)
  })

  it('filters out sections and concepts from other materials', async () => {
    fromResults.materials = { data: { id: 'mat1' } }
    fromResults.chapters = { data: [{ id: 'ch1', material_id: 'mat1', sort_order: 0 }] }
    fromResults.sections = { data: [
      { id: 's1', chapter_id: 'ch1', sort_order: 0 },
      { id: 's-other', chapter_id: 'ch-other', sort_order: 0 },
    ] }
    fromResults.concepts = { data: [
      { id: 'c1', section_id: 's1', sort_order: 0 },
      { id: 'c-other', section_id: 's-other', sort_order: 0 },
    ] }
    fromResults.mastery_state = { data: [] }
    fromResults.chapter_results = { data: [] }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result!.chapters[0].sections).toHaveLength(1)
    expect(result!.chapters[0].sections[0].concepts).toHaveLength(1)
    expect(result!.stats.total).toBe(1)
  })

  it('handles null data arrays gracefully', async () => {
    fromResults.materials = { data: { id: 'mat1' } }
    fromResults.chapters = { data: null }
    fromResults.sections = { data: null }
    fromResults.concepts = { data: null }
    fromResults.mastery_state = { data: null }
    fromResults.chapter_results = { data: null }

    const result = await fetchStudyPlan('user1', 'mat1')
    expect(result!.chapters).toEqual([])
    expect(result!.stats.total).toBe(0)
  })
})

// ── subscribeStudyPlan ────────────────────────────────────────────────

describe('subscribeStudyPlan', () => {
  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeStudyPlan('user1', 'mat1', vi.fn())
    expect(typeof unsubscribe).toBe('function')
  })

  it('subscribes to mastery_state changes', () => {
    const onUpdate = vi.fn()
    subscribeStudyPlan('user1', 'mat1', onUpdate)
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'mastery_state',
        filter: 'user_id=eq.user1',
      }),
      expect.any(Function)
    )
  })

  it('subscribes to chapter_results changes', () => {
    const onUpdate = vi.fn()
    subscribeStudyPlan('user1', 'mat1', onUpdate)
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'chapter_results',
        filter: 'user_id=eq.user1',
      }),
      expect.any(Function)
    )
  })

  it('calls removeChannel on unsubscribe', () => {
    const unsubscribe = subscribeStudyPlan('user1', 'mat1', vi.fn())
    unsubscribe()
    expect(mockRemoveChannel).toHaveBeenCalled()
  })
})
