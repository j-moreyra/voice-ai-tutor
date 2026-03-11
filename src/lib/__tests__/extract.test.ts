import { describe, it, expect, vi } from 'vitest'
import { extractXmlText } from '../extract'

// ── extractXmlText ────────────────────────────────────────────────────

describe('extractXmlText', () => {
  it('extracts text from simple <a:t> tags', () => {
    const xml = '<a:p><a:r><a:t>Hello World</a:t></a:r></a:p>'
    expect(extractXmlText(xml)).toBe('Hello World')
  })

  it('extracts multiple text segments', () => {
    const xml = '<a:r><a:t>First</a:t></a:r><a:r><a:t>Second</a:t></a:r>'
    expect(extractXmlText(xml)).toBe('First Second')
  })

  it('decodes HTML entities', () => {
    const xml = '<a:t>Tom &amp; Jerry &lt;3</a:t>'
    expect(extractXmlText(xml)).toBe('Tom & Jerry <3')
  })

  it('decodes quote entities', () => {
    const xml = '<a:t>She said &quot;hello&quot; and &apos;goodbye&apos;</a:t>'
    expect(extractXmlText(xml)).toBe('She said "hello" and \'goodbye\'')
  })

  it('collapses whitespace', () => {
    const xml = '<a:t>Too   many    spaces</a:t>'
    expect(extractXmlText(xml)).toBe('Too many spaces')
  })

  it('handles multiline text inside tags', () => {
    const xml = '<a:t>Line one\nLine two</a:t>'
    expect(extractXmlText(xml)).toBe('Line one Line two')
  })

  it('skips empty text nodes', () => {
    const xml = '<a:t>Real text</a:t><a:t>   </a:t><a:t>More text</a:t>'
    expect(extractXmlText(xml)).toBe('Real text More text')
  })

  it('returns empty string for no matches', () => {
    const xml = '<p>No a:t tags here</p>'
    expect(extractXmlText(xml)).toBe('')
  })

  it('handles deeply nested tags', () => {
    const xml = `
      <p:sp><p:txBody><a:p><a:r><a:t>Nested deep</a:t></a:r></a:p></p:txBody></p:sp>
    `
    expect(extractXmlText(xml)).toBe('Nested deep')
  })

  it('handles real-world PPTX slide XML fragment', () => {
    const xml = `
      <p:txBody>
        <a:p>
          <a:r><a:rPr lang="en-US" dirty="0"/><a:t>Bacterial Cell Structure</a:t></a:r>
        </a:p>
        <a:p>
          <a:r><a:rPr lang="en-US" dirty="0"/><a:t>Gram Staining &amp; Classification</a:t></a:r>
        </a:p>
      </p:txBody>
    `
    expect(extractXmlText(xml)).toBe('Bacterial Cell Structure Gram Staining & Classification')
  })

  it('handles empty XML', () => {
    expect(extractXmlText('')).toBe('')
  })

  it('handles all five entity types simultaneously', () => {
    const xml = '<a:t>&amp; &lt; &gt; &quot; &apos;</a:t>'
    expect(extractXmlText(xml)).toBe('& < > " \'')
  })

  it('handles tabs and newlines as whitespace', () => {
    const xml = '<a:t>Hello\t\t\nWorld</a:t>'
    expect(extractXmlText(xml)).toBe('Hello World')
  })
})

// ── extractText (dispatch) ────────────────────────────────────────────

// We can't easily test PDF/DOCX/PPTX extraction without actual file
// parsing libraries, but we can test the dispatch and error handling.
// Since extractText imports pdfjs-dist/mammoth/jszip dynamically,
// we test via the module interface.

describe('extractText', () => {
  // We need to dynamically import since the module also imports supabase
  // indirectly — but extract.ts doesn't import supabase, so direct import works.

  it('throws for unsupported file type', async () => {
    const { extractText } = await import('../extract')
    const file = new Blob(['test'], { type: 'text/plain' }) as File
    await expect(extractText(file, 'txt' as never)).rejects.toThrow('Unsupported file type: txt')
  })
})
