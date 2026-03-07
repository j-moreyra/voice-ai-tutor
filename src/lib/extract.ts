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
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(text)
  }

  return pages.join('\n\n')
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

  const slides: { index: number; text: string }[] = []

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (!match) continue

    const xml = await zipEntry.async('text')
    // Extract text from <a:t> tags in the slide XML
    const texts: string[] = []
    const regex = /<a:t>([^<]*)<\/a:t>/g
    let m
    while ((m = regex.exec(xml)) !== null) {
      if (m[1].trim()) texts.push(m[1])
    }

    if (texts.length) {
      slides.push({ index: parseInt(match[1], 10), text: texts.join(' ') })
    }
  }

  slides.sort((a, b) => a.index - b.index)
  return slides.map((s) => s.text).join('\n\n')
}
