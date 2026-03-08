import { describe, it, expect } from 'vitest'
import { extractXmlText } from '../extract'

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
})
