import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Chainable Supabase mock ───────────────────────────────────────────

function createChainableQuery(result: { data?: unknown; error?: unknown } = { data: null }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'limit', 'single', 'from', 'remove', 'upload']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown }
}

let fromResults: Record<string, { data?: unknown; error?: unknown }>
let storageUploadResult: { data?: unknown; error?: unknown }
let storageRemoveResult: { data?: unknown; error?: unknown }
let mockChannel: Record<string, ReturnType<typeof vi.fn>>
let mockRemoveChannel: ReturnType<typeof vi.fn>
let mockGetSession: ReturnType<typeof vi.fn>
let mockFunctionsInvoke: ReturnType<typeof vi.fn>

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const result = fromResults[table] ?? { data: null }
      return createChainableQuery(result)
    },
    storage: {
      from: () => ({
        upload: (..._args: unknown[]) => Promise.resolve(storageUploadResult),
        remove: (..._args: unknown[]) => Promise.resolve(storageRemoveResult),
      }),
    },
    auth: {
      getSession: () => mockGetSession(),
    },
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
    },
    channel: (..._args: unknown[]) => mockChannel,
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}))

vi.mock('../extract', () => ({
  extractText: vi.fn(),
}))

import { validateFile, getFileType, uploadMaterial, fetchMaterials, fetchMaterialStructure, deleteMaterial, subscribeMaterials } from '../materials'
import { extractText } from '../extract'

const mockExtractText = vi.mocked(extractText)

// Helper to create a mock File object
function mockFile(name: string, type: string, size: number): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 100))], { type })
  Object.defineProperty(blob, 'size', { value: size })
  Object.defineProperty(blob, 'name', { value: name })
  return blob as File
}

beforeEach(() => {
  vi.restoreAllMocks()
  fromResults = {}
  storageUploadResult = { data: {}, error: null }
  storageRemoveResult = { data: {}, error: null }
  mockGetSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockFunctionsInvoke = vi.fn().mockResolvedValue({ data: null, error: null })
  mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  } as unknown as Record<string, ReturnType<typeof vi.fn>>
  mockRemoveChannel = vi.fn()
})

// ── validateFile ──────────────────────────────────────────────────────

describe('validateFile', () => {
  it('accepts PDF files', () => {
    expect(validateFile(mockFile('notes.pdf', 'application/pdf', 1024))).toBeNull()
  })

  it('accepts DOCX files', () => {
    expect(validateFile(mockFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024))).toBeNull()
  })

  it('accepts PPTX files', () => {
    expect(validateFile(mockFile('s.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 1024))).toBeNull()
  })

  it('rejects plain text files', () => {
    expect(validateFile(mockFile('notes.txt', 'text/plain', 1024))).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects legacy .doc files', () => {
    expect(validateFile(mockFile('old.doc', 'application/msword', 1024))).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects legacy .ppt files', () => {
    expect(validateFile(mockFile('old.ppt', 'application/vnd.ms-powerpoint', 1024))).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects images', () => {
    expect(validateFile(mockFile('photo.jpg', 'image/jpeg', 1024))).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects Excel files', () => {
    expect(validateFile(mockFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024))).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects mismatched extension and MIME type', () => {
    expect(validateFile(mockFile('slides.pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 1024))).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('accepts files at exactly 50MB', () => {
    expect(validateFile(mockFile('big.pdf', 'application/pdf', 50 * 1024 * 1024))).toBeNull()
  })

  it('rejects files over 50MB', () => {
    expect(validateFile(mockFile('huge.pdf', 'application/pdf', 50 * 1024 * 1024 + 1))).toContain('over 50MB')
  })

  it('rejects very large files', () => {
    expect(validateFile(mockFile('massive.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 200 * 1024 * 1024))).toContain('over 50MB')
  })
})

// ── getFileType ───────────────────────────────────────────────────────

describe('getFileType', () => {
  it('returns pdf for PDF MIME type', () => {
    expect(getFileType(mockFile('x.pdf', 'application/pdf', 100))).toBe('pdf')
  })

  it('returns docx for DOCX MIME type', () => {
    expect(getFileType(mockFile('x.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100))).toBe('docx')
  })

  it('returns pptx for PPTX MIME type', () => {
    expect(getFileType(mockFile('x.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 100))).toBe('pptx')
  })
})

// ── uploadMaterial ────────────────────────────────────────────────────

describe('uploadMaterial', () => {
  const pdfFile = () => mockFile('test.pdf', 'application/pdf', 1024)

  it('returns error when text extraction fails', async () => {
    mockExtractText.mockRejectedValue(new Error('Parse error'))
    const result = await uploadMaterial('user1', pdfFile())
    expect(result.error).toContain('Text extraction failed: Parse error')
  })

  it('returns error when extracted text is empty', async () => {
    mockExtractText.mockResolvedValue('   ')
    const result = await uploadMaterial('user1', pdfFile())
    expect(result.error).toContain('Could not extract any text')
  })

  it('returns error when extracted text is too short', async () => {
    mockExtractText.mockResolvedValue('Short text')
    const result = await uploadMaterial('user1', pdfFile())
    expect(result.error).toContain('Very little text')
  })

  it('returns error when storage upload fails', async () => {
    mockExtractText.mockResolvedValue('x'.repeat(200))
    storageUploadResult = { error: { message: 'Bucket full' } }
    const result = await uploadMaterial('user1', pdfFile())
    expect(result.error).toContain('Storage upload failed: Bucket full')
  })

  it('returns error and cleans up storage when DB insert fails', async () => {
    mockExtractText.mockResolvedValue('x'.repeat(200))
    storageUploadResult = { data: {}, error: null }
    fromResults.materials = { data: null, error: { message: 'Unique violation' } }
    const result = await uploadMaterial('user1', pdfFile())
    expect(result.error).toContain('Database insert failed: Unique violation')
  })

  it('returns null error on success and fires onMaterialCreated', async () => {
    mockExtractText.mockResolvedValue('x'.repeat(200))
    fromResults.materials = { data: { id: 'mat1' }, error: null }
    const onMaterialCreated = vi.fn()
    const onProgress = vi.fn()
    const result = await uploadMaterial('user1', pdfFile(), onProgress, onMaterialCreated)
    expect(result.error).toBeNull()
    expect(onMaterialCreated).toHaveBeenCalledOnce()
    expect(onProgress).toHaveBeenCalledWith('extracting')
  })

  it('calls progress callback through stages', async () => {
    mockExtractText.mockResolvedValue('x'.repeat(200))
    fromResults.materials = { data: { id: 'mat1' }, error: null }
    const stages: string[] = []
    await uploadMaterial('user1', pdfFile(), (stage) => stages.push(stage))
    expect(stages).toContain('extracting')
    expect(stages).toContain('uploading')
  })

  it('fires background processing on success', async () => {
    mockExtractText.mockResolvedValue('x'.repeat(200))
    fromResults.materials = { data: { id: 'mat-abc' }, error: null }
    await uploadMaterial('user1', pdfFile())
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('process-material', expect.objectContaining({
      body: { material_id: 'mat-abc', text_content: 'x'.repeat(200) },
    }))
  })
})

// ── fetchMaterials ────────────────────────────────────────────────────

describe('fetchMaterials', () => {
  it('returns materials array', async () => {
    const materials = [{ id: 'm1', file_name: 'test.pdf' }]
    fromResults.materials = { data: materials }
    const result = await fetchMaterials('user1')
    expect(result).toEqual(materials)
  })

  it('returns empty array when data is null', async () => {
    fromResults.materials = { data: null }
    const result = await fetchMaterials('user1')
    expect(result).toEqual([])
  })
})

// ── fetchMaterialStructure ────────────────────────────────────────────

describe('fetchMaterialStructure', () => {
  it('builds nested chapter > section > concept hierarchy', async () => {
    fromResults.chapters = { data: [{ id: 'ch1', material_id: 'mat1', title: 'Ch1', sort_order: 0 }] }
    fromResults.sections = { data: [
      { id: 's1', chapter_id: 'ch1', title: 'Sec1', sort_order: 0 },
      { id: 's2', chapter_id: 'other', title: 'Sec from other material', sort_order: 0 },
    ] }
    fromResults.concepts = { data: [
      { id: 'c1', section_id: 's1', title: 'Concept1', sort_order: 0 },
      { id: 'c2', section_id: 's2', title: 'Concept from other', sort_order: 0 },
    ] }
    const result = await fetchMaterialStructure('mat1')
    expect(result.chapters).toHaveLength(1)
    expect(result.chapters[0].sections).toHaveLength(1)
    expect(result.chapters[0].sections[0].concepts).toHaveLength(1)
    expect(result.chapters[0].sections[0].concepts[0].title).toBe('Concept1')
  })

  it('filters out sections from other materials', async () => {
    fromResults.chapters = { data: [{ id: 'ch1', material_id: 'mat1', title: 'Ch1', sort_order: 0 }] }
    fromResults.sections = { data: [
      { id: 's1', chapter_id: 'ch1', title: 'Mine', sort_order: 0 },
      { id: 's99', chapter_id: 'other-chapter', title: 'Not mine', sort_order: 0 },
    ] }
    fromResults.concepts = { data: [] }
    const result = await fetchMaterialStructure('mat1')
    expect(result.chapters[0].sections).toHaveLength(1)
    expect(result.chapters[0].sections[0].title).toBe('Mine')
  })

  it('returns empty structure when no chapters exist', async () => {
    fromResults.chapters = { data: [] }
    fromResults.sections = { data: [] }
    fromResults.concepts = { data: [] }
    const result = await fetchMaterialStructure('mat1')
    expect(result.chapters).toEqual([])
  })

  it('handles null data gracefully', async () => {
    fromResults.chapters = { data: null }
    fromResults.sections = { data: null }
    fromResults.concepts = { data: null }
    const result = await fetchMaterialStructure('mat1')
    expect(result.chapters).toEqual([])
  })

  it('handles multiple chapters with correct section assignment', async () => {
    fromResults.chapters = { data: [
      { id: 'ch1', material_id: 'mat1', title: 'Ch1', sort_order: 0 },
      { id: 'ch2', material_id: 'mat1', title: 'Ch2', sort_order: 1 },
    ] }
    fromResults.sections = { data: [
      { id: 's1', chapter_id: 'ch1', title: 'Sec1', sort_order: 0 },
      { id: 's2', chapter_id: 'ch2', title: 'Sec2', sort_order: 0 },
      { id: 's3', chapter_id: 'ch2', title: 'Sec3', sort_order: 1 },
    ] }
    fromResults.concepts = { data: [] }
    const result = await fetchMaterialStructure('mat1')
    expect(result.chapters[0].sections).toHaveLength(1)
    expect(result.chapters[1].sections).toHaveLength(2)
  })
})

// ── deleteMaterial ────────────────────────────────────────────────────

describe('deleteMaterial', () => {
  it('returns null on success', async () => {
    storageRemoveResult = { error: null }
    fromResults.materials = { data: null, error: null }
    const result = await deleteMaterial('user1', 'mat1', 'path/file.pdf')
    expect(result).toBeNull()
  })

  it('returns storage error message when storage delete fails', async () => {
    storageRemoveResult = { error: { message: 'Not found' } }
    const result = await deleteMaterial('user1', 'mat1', 'path/file.pdf')
    expect(result).toBe('Not found')
  })

  it('returns DB error message when DB delete fails', async () => {
    storageRemoveResult = { error: null }
    fromResults.materials = { error: { message: 'Permission denied' } }
    const result = await deleteMaterial('user1', 'mat1', 'path/file.pdf')
    expect(result).toBe('Permission denied')
  })
})

// ── subscribeMaterials ────────────────────────────────────────────────

describe('subscribeMaterials', () => {
  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeMaterials('user1', vi.fn())
    expect(typeof unsubscribe).toBe('function')
  })

  it('sets up postgres_changes listener on materials table', () => {
    const onUpdate = vi.fn()
    subscribeMaterials('user1', onUpdate)
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'materials',
        filter: 'user_id=eq.user1',
      }),
      onUpdate
    )
  })

  it('calls removeChannel on unsubscribe', () => {
    const unsubscribe = subscribeMaterials('user1', vi.fn())
    unsubscribe()
    expect(mockRemoveChannel).toHaveBeenCalled()
  })
})
