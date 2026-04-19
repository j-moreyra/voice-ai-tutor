import { supabase } from './supabase'
import { extractText } from './extract'
import type { Material, Chapter, Section, Concept, FileType } from '../types/database'

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const ACCEPTED_EXTENSIONS: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
}

const CHUNK_SIZE = 6_000
const OVERLAP_SIZE = 500
const MAX_TOTAL_CHARS = 400_000
const MAX_RETRIES = 5

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

// ── Chunking ─────────────────────────────────────────────────────────

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

export function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]

  const chunks: string[] = []
  let offset = 0

  while (offset < text.length) {
    let end = Math.min(offset + CHUNK_SIZE, text.length)

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

async function processChunkViaProxy(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  materialId: string,
  accessToken: string,
): Promise<StructuredPlan> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${supabaseUrl}/functions/v1/process-material`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        material_id: materialId,
        chunk_text: chunkText,
        chunk_index: chunkIndex,
        total_chunks: totalChunks,
      }),
    })

    if (res.ok) {
      return await res.json() as StructuredPlan
    }

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      const retryAfterSec = (body as { retry_after?: number }).retry_after ?? 60
      console.log(`[processing] Rate limited on chunk ${chunkIndex + 1}, waiting ${retryAfterSec}s (attempt ${attempt + 1})`)
      await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000))
      continue
    }

    const errBody = await res.text().catch(() => `HTTP ${res.status}`)
    throw new Error(`Chunk ${chunkIndex + 1} failed: ${errBody}`)
  }

  throw new Error(`Chunk ${chunkIndex + 1} failed after ${MAX_RETRIES} retries (rate limited)`)
}

// ── Merging ──────────────────────────────────────────────────────────

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
        chapterMap.set(chapter.title, { title: chapter.title, sectionMap: new Map() })
        chapterOrder.push(chapter.title)
      }
      const entry = chapterMap.get(chapter.title)!

      for (const section of chapter.sections) {
        if (!entry.sectionMap.has(section.title)) {
          entry.sectionMap.set(section.title, { title: section.title, conceptMap: new Map() })
        }
        const sectionEntry = entry.sectionMap.get(section.title)!

        for (const concept of section.concepts) {
          if (!sectionEntry.conceptMap.has(concept.title)) {
            sectionEntry.conceptMap.set(concept.title, { title: concept.title, key_facts: concept.key_facts })
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

// ── DB writes ────────────────────────────────────────────────────────

async function writePlanToSupabase(
  plan: StructuredPlan,
  materialId: string,
  userId: string,
): Promise<void> {
  const chapterMap = new Map<string, { id: string; sectionMap: Map<string, string> }>()
  const allConceptIds: string[] = []

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

    chapterMap.set(chapter.title, { id: chapterRow.id, sectionMap: new Map() })

    for (const section of chapter.sections) {
      const { data: sectionRow, error: sectionErr } = await supabase
        .from('sections')
        .insert({
          chapter_id: chapterRow.id,
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

      chapterMap.get(chapter.title)!.sectionMap.set(section.title, sectionRow.id)

      if (section.concepts.length) {
        const conceptRows = section.concepts.map((c) => ({
          section_id: sectionRow.id,
          user_id: userId,
          title: c.title,
          key_facts: c.key_facts,
          sort_order: c.sort_order,
        }))

        const { data: insertedConcepts, error: conceptErr } = await supabase
          .from('concepts')
          .insert(conceptRows)
          .select('id')

        if (conceptErr) {
          console.error('Failed to insert concepts:', conceptErr)
        } else if (insertedConcepts) {
          allConceptIds.push(...insertedConcepts.map((c: { id: string }) => c.id))
        }
      }
    }
  }

  if (allConceptIds.length) {
    const masteryRows = allConceptIds.map((conceptId) => ({
      concept_id: conceptId,
      user_id: userId,
      status: 'not_started',
    }))

    const { error: masteryErr } = await supabase.from('mastery_state').insert(masteryRows)
    if (masteryErr) console.error('Failed to insert mastery_state rows:', masteryErr)
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

// ── Upload + process ─────────────────────────────────────────────────

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

  // 5. Process in the background — client-side orchestration.
  //    Each chunk is sent to the edge function individually (one Anthropic call
  //    per request, no server timeout). Rate-limit retries happen here in the
  //    browser so no server-side wait is needed.
  onProgress?.('processing')
  const materialId = (material as Material).id

  processChunkedMaterial(userId, materialId, extractedText).catch((err) => {
    console.error('[uploadMaterial] Processing failed:', err)
  })

  return { error: null }
}

async function processChunkedMaterial(
  userId: string,
  materialId: string,
  textContent: string,
): Promise<void> {
  try {
    await supabase
      .from('materials')
      .update({ processing_status: 'processing' })
      .eq('id', materialId)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Not authenticated')
    }

    const text = textContent.length > MAX_TOTAL_CHARS
      ? textContent.slice(0, MAX_TOTAL_CHARS) + '\n\n[Content truncated due to length]'
      : textContent

    const chunks = splitTextIntoChunks(text)
    console.log(`[processing] Starting: ${text.length} chars, ${chunks.length} chunk(s)`)

    const chunkResults: StructuredPlan[] = []
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[processing] Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const result = await processChunkViaProxy(
        chunks[i], i, chunks.length, materialId, session.access_token,
      )
      console.log(`[processing] Chunk ${i + 1} done: ${result.chapters?.length ?? 0} chapters`)
      chunkResults.push(result)

      // Heartbeat so the UI doesn't show "Stuck"
      await supabase
        .from('materials')
        .update({ processing_status: 'processing' })
        .eq('id', materialId)
    }

    const plan = mergePlans(chunkResults)

    if (!plan.chapters?.length) {
      throw new Error('No chapters found in structured plan')
    }

    console.log(`[processing] Writing ${plan.chapters.length} chapters to DB`)
    await writePlanToSupabase(plan, materialId, userId)

    await supabase
      .from('materials')
      .update({ processing_status: 'completed' })
      .eq('id', materialId)

    console.log(`[processing] Material ${materialId} completed`)
  } catch (err) {
    console.error('[processing] Error:', err)
    await supabase
      .from('materials')
      .update({
        processing_status: 'failed',
        processing_error: (err as Error).message,
      })
      .eq('id', materialId)
  }
}

// ── Queries ──────────────────────────────────────────────────────────

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
