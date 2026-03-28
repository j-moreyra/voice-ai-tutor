import { supabase } from './supabase'
import { extractText } from './extract'
import type { Material, Chapter, Section, Concept, FileType } from '../types/database'

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const CHUNK_SIZE = 12_000
const OVERLAP_SIZE = 500
const MAX_TOTAL_CHARS = 400_000

const ACCEPTED_EXTENSIONS: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
}

const PROCESSING_PROMPT = `You are a material processing engine for an AI tutoring system. Your job is to take raw study material text and decompose it into the most granular possible lesson plan — every individual fact, definition, step, mechanism, classification, and sub-concept as its own discrete entry.
Analyze the following study material and return a JSON object with this exact structure:
{
  "chapters": [
    {
      "title": "Chapter title",
      "sort_order": 0,
      "sections": [
        {
          "title": "Section title",
          "sort_order": 0,
          "concepts": [
            {
              "title": "Concept name",
              "key_facts": "The specific facts, definition, mechanism, or steps for this concept — written in full detail, not summarized",
              "sort_order": 0
            }
          ]
        }
      ]
    }
  ],
  "professor_questions": [
    {
      "question_text": "The original question text",
      "question_type": "recall | application | synthesis | multiple_choice | true_false | essay",
      "suggested_placement": "section_quiz | chapter_assessment",
      "chapter_title": "Which chapter this question belongs to",
      "section_title": "Which section this question belongs to (if identifiable)"
    }
  ]
}
EXTRACTION RULES — FOLLOW EXACTLY:
GRANULARITY: Extract at the most granular level the material presents. If a section lists 5 steps, those are 5 separate concepts. If it defines 4 types of bacteria, those are 4 separate concepts. If a paragraph explains a mechanism with 3 distinct parts, those are 3 separate concepts. Never bundle multiple distinct facts, steps, types, or definitions into a single concept entry.
CONCEPT SCOPE: Each concept must be a single, atomic unit of knowledge — one definition, one mechanism, one step, one classification, one relationship. If you cannot ask a single focused question about the concept, it is too broad and must be split further.
KEY FACTS: The key_facts field must contain the full, specific detail from the material — not a summary. Include exact terminology, specific values, numbered steps, named components, and precise relationships exactly as the material presents them. A tutor will read this field aloud — it must be complete enough to teach from without referring back to the original document.
COVERAGE: Every piece of information in the material must appear in at least one concept's key_facts. Nothing should be omitted, generalized, or left implied. If the material mentions it, it must be in the structured output.
NO UPPER LIMIT: There is no maximum number of concepts per section. A dense section with 15 distinct points should produce 15 concepts. Do not artificially compress content to fit a target count.
STRUCTURE: Break material into chapters based on major topic divisions. Each chapter should have 2-6 sections. Sections group related concepts — not limit them.
ORDER: Sequence concepts from foundational to advanced within each section. Teach prerequisites before the concepts that depend on them.
TERMINOLOGY: Use the exact same terms as the source material. Do not paraphrase, rename, or substitute synonyms.
QUESTIONS: Extract any assessment questions, practice problems, review questions, quiz items, multiple choice, true/false, or essay prompts. Tag by type and suggest placement.
Return ONLY the JSON object. No preamble, no markdown backticks, no explanation.`

// ── Types for structured plans ───────────────────────────────────────

interface StructuredChapter {
  title: string
  sort_order: number
  sections: {
    title: string
    sort_order: number
    concepts: {
      title: string
      key_facts: string | null
      sort_order: number
    }[]
  }[]
}

interface ProfessorQuestion {
  question_text: string
  question_type: string | null
  suggested_placement: string | null
  chapter_title: string | null
  section_title: string | null
}

interface StructuredPlan {
  chapters: StructuredChapter[]
  professor_questions?: ProfessorQuestion[]
}

// ── Chunking helpers ─────────────────────────────────────────────────

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

export function validateFile(file: File): string | null {
  const mimeType = ACCEPTED_TYPES[file.type]
  const extensionType = ACCEPTED_EXTENSIONS[getExtension(file.name)]

  if (!mimeType || !extensionType || mimeType !== extensionType) {
    return 'Only PDF, DOCX, and PPTX files are accepted.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'This file is over 50MB. Try splitting it into smaller sections or compressing images.'
  }
  return null
}

export function getFileType(file: File): FileType {
  return ACCEPTED_TYPES[file.type]!
}

/**
 * Split text into chunks of up to CHUNK_SIZE characters, breaking at paragraph
 * boundaries when possible. Each chunk (after the first) is prefixed with
 * OVERLAP_SIZE characters from the end of the previous chunk for context.
 */
export function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]

  const chunks: string[] = []
  let offset = 0

  while (offset < text.length) {
    let end = Math.min(offset + CHUNK_SIZE, text.length)

    // Try to break at a paragraph boundary within the last 20% of the chunk
    if (end < text.length) {
      const searchStart = offset + Math.floor(CHUNK_SIZE * 0.8)
      const breakZone = text.slice(searchStart, end)
      const lastParagraph = breakZone.lastIndexOf('\n\n')
      if (lastParagraph !== -1) {
        end = searchStart + lastParagraph + 2
      }
    }

    chunks.push(text.slice(offset, end))

    offset = Math.max(end - OVERLAP_SIZE, offset + 1)
    if (end >= text.length) break
  }

  return chunks
}

/**
 * Call the Netlify serverless function to process a single chunk via the
 * Anthropic API. The API key stays server-side.
 */
export async function processChunkViaProxy(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
): Promise<StructuredPlan> {
  const res = await fetch('/.netlify/functions/process-chunk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: chunkText,
      prompt: PROCESSING_PROMPT,
      chunk_index: chunkIndex,
      total_chunks: totalChunks,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error ?? `Chunk ${chunkIndex + 1} failed with status ${res.status}`)
  }

  return res.json()
}

/**
 * Merge multiple StructuredPlan results into one. Chapters and sections with
 * identical titles are combined; concepts are deduplicated by title within
 * each section. Sort orders are renumbered sequentially.
 */
export function mergePlans(plans: StructuredPlan[]): StructuredPlan {
  if (plans.length === 1) return plans[0]

  const chapterMap = new Map<string, {
    title: string
    sectionMap: Map<string, {
      title: string
      conceptMap: Map<string, { title: string; key_facts: string | null }>
    }>
  }>()

  const allQuestions: ProfessorQuestion[] = []
  const chapterOrder: string[] = []

  for (const plan of plans) {
    for (const chapter of (plan.chapters ?? [])) {
      if (!chapterMap.has(chapter.title)) {
        chapterMap.set(chapter.title, {
          title: chapter.title,
          sectionMap: new Map(),
        })
        chapterOrder.push(chapter.title)
      }
      const entry = chapterMap.get(chapter.title)!

      for (const section of chapter.sections) {
        if (!entry.sectionMap.has(section.title)) {
          entry.sectionMap.set(section.title, {
            title: section.title,
            conceptMap: new Map(),
          })
        }
        const sectionEntry = entry.sectionMap.get(section.title)!

        for (const concept of section.concepts) {
          if (!sectionEntry.conceptMap.has(concept.title)) {
            sectionEntry.conceptMap.set(concept.title, {
              title: concept.title,
              key_facts: concept.key_facts,
            })
          }
        }
      }
    }

    if (plan.professor_questions?.length) {
      allQuestions.push(...plan.professor_questions)
    }
  }

  const chapters: StructuredChapter[] = []
  let chapterIdx = 0
  for (const chapterTitle of chapterOrder) {
    const entry = chapterMap.get(chapterTitle)!
    const sections: StructuredChapter['sections'] = []
    let sectionIdx = 0
    for (const [, sectionEntry] of entry.sectionMap) {
      const concepts: StructuredChapter['sections'][0]['concepts'] = []
      let conceptIdx = 0
      for (const [, concept] of sectionEntry.conceptMap) {
        concepts.push({ title: concept.title, key_facts: concept.key_facts, sort_order: conceptIdx++ })
      }
      sections.push({ title: sectionEntry.title, sort_order: sectionIdx++, concepts })
    }
    chapters.push({ title: entry.title, sort_order: chapterIdx++, sections })
  }

  const seenQuestions = new Set<string>()
  const uniqueQuestions = allQuestions.filter((q) => {
    if (seenQuestions.has(q.question_text)) return false
    seenQuestions.add(q.question_text)
    return true
  })

  return { chapters, professor_questions: uniqueQuestions.length ? uniqueQuestions : undefined }
}

/**
 * Write a merged StructuredPlan to Supabase (chapters, sections, concepts,
 * professor_questions).
 */
async function writePlanToSupabase(
  plan: StructuredPlan,
  materialId: string,
  userId: string,
): Promise<void> {
  const chapterMap = new Map<string, { id: string; sectionMap: Map<string, string> }>()

  for (const chapter of plan.chapters) {
    const { data: chapterRow, error: chapterErr } = await supabase
      .from('chapters')
      .insert({
        material_id: materialId,
        user_id: userId,
        title: chapter.title,
        sort_order: chapter.sort_order,
      })
      .select('id')
      .single()

    if (chapterErr || !chapterRow) {
      console.error('Failed to insert chapter:', chapterErr)
      continue
    }

    chapterMap.set(chapter.title, { id: (chapterRow as { id: string }).id, sectionMap: new Map() })

    for (const section of chapter.sections) {
      const { data: sectionRow, error: sectionErr } = await supabase
        .from('sections')
        .insert({
          chapter_id: (chapterRow as { id: string }).id,
          user_id: userId,
          title: section.title,
          sort_order: section.sort_order,
        })
        .select('id')
        .single()

      if (sectionErr || !sectionRow) {
        console.error('Failed to insert section:', sectionErr)
        continue
      }

      chapterMap.get(chapter.title)!.sectionMap.set(section.title, (sectionRow as { id: string }).id)

      if (section.concepts.length) {
        const conceptRows = section.concepts.map((c) => ({
          section_id: (sectionRow as { id: string }).id,
          user_id: userId,
          title: c.title,
          key_facts: c.key_facts,
          sort_order: c.sort_order,
        }))

        const { error: conceptErr } = await supabase.from('concepts').insert(conceptRows)
        if (conceptErr) console.error('Failed to insert concepts:', conceptErr)
      }
    }
  }

  if (plan.professor_questions?.length) {
    const questionRows = plan.professor_questions.map((q) => {
      const chapterEntry = q.chapter_title ? chapterMap.get(q.chapter_title) : undefined
      return {
        chapter_id: chapterEntry?.id ?? null,
        section_id: q.section_title && chapterEntry ? chapterEntry.sectionMap.get(q.section_title) ?? null : null,
        user_id: userId,
        question_text: q.question_text,
        question_type: q.question_type,
        suggested_placement: q.suggested_placement,
      }
    })

    const { error: qErr } = await supabase.from('professor_questions').insert(questionRows)
    if (qErr) console.error('Failed to insert questions:', qErr)
  }
}

// ── Main upload flow ─────────────────────────────────────────────────

export async function uploadMaterial(
  userId: string,
  file: File,
  onProgress?: (stage: 'extracting' | 'uploading' | 'processing') => void,
  onMaterialCreated?: () => void
): Promise<{ error: string | null }> {
  // 1. Extract text client-side
  onProgress?.('extracting')
  const fileType = getFileType(file)
  let extractedText: string
  try {
    extractedText = await extractText(file, fileType)
  } catch (err) {
    return { error: `Text extraction failed: ${(err as Error).message}` }
  }

  if (!extractedText.trim()) {
    return { error: 'Could not extract any text from this file. The file may be image-based, empty, or contain only diagrams. Try a text-based version of the file.' }
  }

  if (extractedText.trim().length < 100) {
    return { error: 'Very little text was extracted from this file. The file may be mostly images or diagrams. Voice tutoring works best with text-heavy materials.' }
  }

  // 2. Upload file to storage
  onProgress?.('uploading')
  const storagePath = `${userId}/${Date.now()}_${file.name}`

  const { error: storageError } = await supabase.storage
    .from('materials')
    .upload(storagePath, file, { upsert: false })

  if (storageError) {
    return { error: `Storage upload failed: ${storageError.message}` }
  }

  // 3. Create material record
  const { data: material, error: insertError } = await supabase
    .from('materials')
    .insert({
      user_id: userId,
      file_name: file.name,
      file_type: fileType,
      storage_path: storagePath,
      file_size_bytes: file.size,
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from('materials').remove([storagePath])
    return { error: `Database insert failed: ${insertError.message}` }
  }

  // 4. Notify caller so the material card appears immediately
  onMaterialCreated?.()

  // 5. Process text via Netlify serverless proxy (chunked)
  onProgress?.('processing')
  const materialId = (material as Material).id

  // Set status to processing
  await supabase
    .from('materials')
    .update({ processing_status: 'processing' })
    .eq('id', materialId)

  // Fire-and-forget: process chunks in background so uploadMaterial returns fast
  processChunkedMaterial(materialId, userId, extractedText).catch((err) => {
    console.error('[uploadMaterial] Background processing failed:', err)
  })

  return { error: null }
}

/**
 * Process extracted text through the Netlify proxy in chunks, merge results,
 * write to Supabase, and update material status.
 */
export async function processChunkedMaterial(
  materialId: string,
  userId: string,
  textContent: string,
): Promise<void> {
  try {
    const text = textContent.length > MAX_TOTAL_CHARS
      ? textContent.slice(0, MAX_TOTAL_CHARS) + '\n\n[Content truncated due to length]'
      : textContent

    const chunks = splitTextIntoChunks(text)
    console.log(`[processChunkedMaterial] ${text.length} chars, ${chunks.length} chunk(s)`)

    const chunkResults: StructuredPlan[] = []
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[processChunkedMaterial] Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const result = await processChunkViaProxy(chunks[i], i, chunks.length)
      chunkResults.push(result)
    }

    const plan = mergePlans(chunkResults)

    if (!plan.chapters?.length) {
      throw new Error('No chapters found in structured plan')
    }

    await writePlanToSupabase(plan, materialId, userId)

    await supabase
      .from('materials')
      .update({ processing_status: 'completed' })
      .eq('id', materialId)

    console.log(`[processChunkedMaterial] Material ${materialId} completed`)
  } catch (err) {
    console.error('[processChunkedMaterial] Error:', err)

    await supabase
      .from('materials')
      .update({
        processing_status: 'failed',
        processing_error: (err as Error).message,
      })
      .eq('id', materialId)
  }
}

// ── Other material operations ────────────────────────────────────────

export async function fetchMaterials(userId: string): Promise<Material[]> {
  const { data } = await supabase
    .from('materials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data as Material[]) ?? []
}

export interface MaterialStructure {
  chapters: (Chapter & {
    sections: (Section & {
      concepts: Concept[]
    })[]
  })[]
}

export async function fetchMaterialStructure(materialId: string): Promise<MaterialStructure> {
  const chaptersRes = await supabase
    .from('chapters')
    .select('*')
    .eq('material_id', materialId)
    .order('sort_order')

  const chapters = (chaptersRes.data as Chapter[]) ?? []
  const chapterIds = chapters.map((c) => c.id)

  const sectionsRes = chapterIds.length
    ? await supabase.from('sections').select('*').in('chapter_id', chapterIds).order('sort_order')
    : { data: [] }

  const sections = (sectionsRes.data as Section[]) ?? []
  const sectionIds = sections.map((s) => s.id)

  const conceptsRes = sectionIds.length
    ? await supabase.from('concepts').select('*').in('section_id', sectionIds).order('sort_order')
    : { data: [] }

  const concepts = (conceptsRes.data as Concept[]) ?? []

  return {
    chapters: chapters.map((chapter) => ({
      ...chapter,
      sections: sections
        .filter((s) => s.chapter_id === chapter.id)
        .map((section) => ({
          ...section,
          concepts: concepts.filter((c) => c.section_id === section.id),
        })),
    })),
  }
}

export async function deleteMaterial(userId: string, materialId: string, storagePath: string): Promise<string | null> {
  const { error: storageError } = await supabase.storage
    .from('materials')
    .remove([storagePath])

  if (storageError) {
    return storageError.message
  }

  const { error: dbError } = await supabase
    .from('materials')
    .delete()
    .eq('id', materialId)
    .eq('user_id', userId)

  return dbError?.message ?? null
}

export function subscribeMaterials(userId: string, onUpdate: () => void) {
  const channel = supabase
    .channel('materials-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'materials',
        filter: `user_id=eq.${userId}`,
      },
      onUpdate
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
