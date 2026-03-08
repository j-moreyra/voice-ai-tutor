import { describe, it, expect, vi } from 'vitest'

// Mock the supabase module before importing materials
vi.mock('../supabase', () => ({
  supabase: {},
}))

import { validateFile } from '../materials'

// Helper to create a mock File object
function mockFile(name: string, type: string, size: number): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 100))], { type })
  Object.defineProperty(blob, 'size', { value: size })
  Object.defineProperty(blob, 'name', { value: name })
  return blob as File
}

describe('validateFile', () => {
  // Accepted types
  it('accepts PDF files', () => {
    const file = mockFile('notes.pdf', 'application/pdf', 1024)
    expect(validateFile(file)).toBeNull()
  })

  it('accepts DOCX files', () => {
    const file = mockFile('essay.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024)
    expect(validateFile(file)).toBeNull()
  })

  it('accepts PPTX files', () => {
    const file = mockFile('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 1024)
    expect(validateFile(file)).toBeNull()
  })

  // Rejected types
  it('rejects plain text files', () => {
    const file = mockFile('notes.txt', 'text/plain', 1024)
    expect(validateFile(file)).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects legacy .doc files', () => {
    const file = mockFile('old.doc', 'application/msword', 1024)
    expect(validateFile(file)).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects legacy .ppt files', () => {
    const file = mockFile('old.ppt', 'application/vnd.ms-powerpoint', 1024)
    expect(validateFile(file)).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects images', () => {
    const file = mockFile('photo.jpg', 'image/jpeg', 1024)
    expect(validateFile(file)).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  it('rejects Excel files', () => {
    const file = mockFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024)
    expect(validateFile(file)).toBe('Only PDF, DOCX, and PPTX files are accepted.')
  })

  // Size limits
  it('accepts files at exactly 50MB', () => {
    const file = mockFile('big.pdf', 'application/pdf', 50 * 1024 * 1024)
    expect(validateFile(file)).toBeNull()
  })

  it('rejects files over 50MB', () => {
    const file = mockFile('huge.pdf', 'application/pdf', 50 * 1024 * 1024 + 1)
    expect(validateFile(file)).toContain('over 50MB')
  })

  it('rejects very large files', () => {
    const file = mockFile('massive.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 200 * 1024 * 1024)
    expect(validateFile(file)).toContain('over 50MB')
  })
})
