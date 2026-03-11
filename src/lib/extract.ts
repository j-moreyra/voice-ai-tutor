import type { FileType } from '../types/database'

// Retry a dynamic import once after forcing a page reload to bust stale PWA/CDN cache.
// On chunk load failure, we mark sessionStorage so we don't loop, then reload.
async function importWithRetry<T>(importFn: () => Promise<T>, name: string): Promise<T> {
  try {
    return await importFn()
  } catch (err) {
    const key = `chunk-reload-${name}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.reload()
      // Never resolves — page is reloading
      return new Promise(() => {})
    }
    sessionStorage.removeItem(key)
    throw err
  }
}

export async function extractText(file: File, fileType: FileType): Promise<string> {
  switch (fileType) {
    case 'pdf':
      return extractPdfText(file)
    case 'docx':
      return extractDocxText(file)
    case 'pptx':
      return extractPptxText(file)
    default:
      throw new Error(`Unsupported file type: ${fileType}`)
  }
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await importWithRetry(() => import('pdfjs-dist'), 'pdfjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  const buffer = await file.arrayBuffer()
  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  } catch (err) {
    const message = (err as Error).message || ''
    if (message.includes('password')) {
      throw new Error('This PDF is password-protected. Please remove the password and try again.')
    }
    throw err
  }

  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(text)
  }

  const result = pages.join('\n\n')
  if (!result.trim()) {
    throw new Error(
      'This PDF appears to be scanned or image-based. Text-based PDFs are required — try re-saving it with OCR enabled, or use a tool like Adobe Acrobat to make it searchable.'
    )
  }
  return result
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await importWithRetry(() => import('mammoth'), 'mammoth')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.default.extractRawText({ arrayBuffer: buffer })
  return result.value
}

async function extractPptxText(file: File): Promise<string> {
  const JSZip = (await importWithRetry(() => import('jszip'), 'jszip')).default
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  const slideMap = new Map<number, { index: number; text: string; notes: string }>()

  function getOrCreateSlide(index: number) {
    let slide = slideMap.get(index)
    if (!slide) {
      slide = { index, text: '', notes: '' }
      slideMap.set(index, slide)
    }
    return slide
  }

  let lastSlideIndex = 0

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    const slideMatch = path.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (slideMatch) {
      const xml = await zipEntry.async('text')
      const index = parseInt(slideMatch[1], 10)
      getOrCreateSlide(index).text = extractXmlText(xml)
      if (index > lastSlideIndex) lastSlideIndex = index
      continue
    }

    const notesMatch = path.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/)
    if (notesMatch) {
      const xml = await zipEntry.async('text')
      const index = parseInt(notesMatch[1], 10)
      getOrCreateSlide(index).notes = extractXmlText(xml)
      continue
    }

    const chartMatch = path.match(/^ppt\/charts\/chart\d+\.xml$/)
    if (chartMatch) {
      const xml = await zipEntry.async('text')
      const chartTexts: string[] = []
      const chartRegex = /<c:v>([\s\S]*?)<\/c:v>/g
      let cm
      while ((cm = chartRegex.exec(xml)) !== null) {
        const val = cm[1].trim()
        if (val && isNaN(Number(val))) chartTexts.push(val)
      }
      // Charts aren't tied to a specific slide easily, append to last slide
      if (chartTexts.length && lastSlideIndex > 0) {
        getOrCreateSlide(lastSlideIndex).text += ' ' + chartTexts.join(' ')
      }
      continue
    }

    const diagramMatch = path.match(/^ppt\/diagrams\/data\d+\.xml$/)
    if (diagramMatch) {
      const xml = await zipEntry.async('text')
      const diagText = extractXmlText(xml)
      if (diagText && lastSlideIndex > 0) {
        getOrCreateSlide(lastSlideIndex).text += ' ' + diagText
      }
      continue
    }
  }

  const slides = Array.from(slideMap.values()).sort((a, b) => a.index - b.index)
  return slides
    .map((s) => {
      let content = s.text
      if (s.notes) {
        content += '\n[Notes] ' + s.notes
      }
      return content
    })
    .filter((s) => s.trim())
    .join('\n\n')
}

export function extractXmlText(xml: string): string {
  const texts: string[] = []
  // Match <a:t> tags — covers normal text, grouped shapes, and fallback content
  const regex = /<a:t>([\s\S]*?)<\/a:t>/g
  let m
  while ((m = regex.exec(xml)) !== null) {
    const decoded = m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
    if (decoded.trim()) texts.push(decoded.trim())
  }
  return texts.join(' ')
}
