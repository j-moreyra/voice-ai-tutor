import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { Context } from '@netlify/functions'

// Netlify background functions must export a default handler and have a filename
// ending in `-background`. They get a 15-minute timeout instead of 10 seconds.

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://voice-ai-tutor.netlify.app',
]

const CHUNK_SIZE = 8_000
const OVERLAP_SIZE = 500
const MAX_TOTAL_CHARS = 400_000

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

// ── Types ────────────────────────────────────────────────────────────

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

// ── Chunking ─────────────────────────────────────────────────────────

function splitTextIntoChunks(text: string): string[] {
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

async function processChunk(
  anthropic: Anthropic,
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
): Promise<StructuredPlan> {
  const chunkContext = totalChunks > 1
    ? `\n\nIMPORTANT CONTEXT: This is chunk ${chunkIndex + 1} of ${totalChunks} from a larger document. Process ONLY the content in this chunk. Use sort_order values starting from ${chunkIndex * 1000} so they can be merged with other chunks later. If a chapter or section appears to continue from a previous chunk, use the EXACT same title so chunks can be merged.\n\n---\n\nHere is the extracted text for this chunk:\n\n`
    : '\n\n---\n\nHere is the extracted text:\n\n'

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: `${PROCESSING_PROMPT}${chunkContext}${chunkText}`,
      },
    ],
  })

  const responseText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.type === 'text' ? block.text : '')
    .join('')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Claude did not return valid JSON for chunk ${chunkIndex + 1}`)
  }

  return JSON.parse(jsonMatch[0]) as StructuredPlan
}

// ── Merging ──────────────────────────────────────────────────────────

function mergePlans(plans: StructuredPlan[]): StructuredPlan {
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
  supabase: ReturnType<typeof createClient>,
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

  // Initialize mastery_state rows for all concepts
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

// ── Background function handler ──────────────────────────────────────

export default async (req: Request, _context: Context) => {
  // Background functions return 202 automatically — Netlify invokes the
  // handler asynchronously after acknowledging the request.

  console.log('[bg-process] Function invoked')

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[bg-process] Missing required environment variables', {
      hasAnthropicKey: !!ANTHROPIC_API_KEY,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
    })
    return
  }

  let materialId: string | undefined
  let userId: string | undefined

  try {
    const body = await req.json()
    materialId = body.material_id
    userId = body.user_id
    const textContent: string = body.text_content
    const authToken: string = body.auth_token

    console.log('[bg-process] Request body parsed', {
      material_id: materialId,
      user_id: userId,
      hasTextContent: !!textContent,
      textLength: textContent?.length ?? 0,
      hasAuthToken: !!authToken,
    })

    if (!materialId || !userId || !textContent || !authToken) {
      console.error('[bg-process] Missing required fields in request body')
      return
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Set status to processing immediately so we can tell the function body is executing
    console.log('[bg-process] Setting material status to processing')
    const { error: statusError } = await supabase
      .from('materials')
      .update({ processing_status: 'processing' })
      .eq('id', materialId)

    if (statusError) {
      console.error('[bg-process] Failed to set processing status:', statusError)
    }

    // 1. Verify the auth token is valid (401 equivalent)
    console.log('[bg-process] Verifying auth token...')
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken)
    if (authError || !user) {
      console.error('[bg-process] Auth token invalid:', authError?.message ?? 'No user returned')
      await supabase
        .from('materials')
        .update({ processing_status: 'failed', processing_error: 'Authentication failed' })
        .eq('id', materialId)
      return
    }
    console.log('[bg-process] Auth token valid, user:', user.id)

    // 2. Confirm the token's user matches the claimed user_id (401 equivalent)
    if (user.id !== userId) {
      console.error('[bg-process] Auth user mismatch: token user', user.id, '!= claimed user', userId)
      await supabase
        .from('materials')
        .update({ processing_status: 'failed', processing_error: 'Authentication failed' })
        .eq('id', materialId)
      return
    }
    console.log('[bg-process] User ID match confirmed')

    // 3. Confirm the material belongs to this user (403 equivalent)
    console.log('[bg-process] Checking material ownership...')
    const { data: material, error: matError } = await supabase
      .from('materials')
      .select('id, user_id')
      .eq('id', materialId)
      .single()

    if (matError || !material) {
      console.error('[bg-process] Material not found:', materialId, matError)
      return
    }

    if (material.user_id !== user.id) {
      console.error('[bg-process] Material ownership mismatch: material belongs to', material.user_id, 'not', user.id)
      await supabase
        .from('materials')
        .update({ processing_status: 'failed', processing_error: 'Forbidden' })
        .eq('id', materialId)
      return
    }
    console.log('[bg-process] Material ownership confirmed')

    // Truncate if needed
    const text = textContent.length > MAX_TOTAL_CHARS
      ? textContent.slice(0, MAX_TOTAL_CHARS) + '\n\n[Content truncated due to length]'
      : textContent

    const chunks = splitTextIntoChunks(text)
    console.log(`[bg-process] Starting Anthropic calls: ${text.length} chars, ${chunks.length} chunk(s)`)

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const chunkResults: StructuredPlan[] = []
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[bg-process] Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const result = await processChunk(anthropic, chunks[i], i, chunks.length)
      console.log(`[bg-process] Chunk ${i + 1} completed: ${result.chapters?.length ?? 0} chapters`)
      chunkResults.push(result)
    }

    const plan = mergePlans(chunkResults)

    if (!plan.chapters?.length) {
      throw new Error('No chapters found in structured plan')
    }

    console.log(`[bg-process] Writing plan to Supabase: ${plan.chapters.length} chapters`)
    await writePlanToSupabase(supabase, plan, materialId, userId)

    await supabase
      .from('materials')
      .update({ processing_status: 'completed' })
      .eq('id', materialId)

    console.log(`[bg-process] Material ${materialId} processing completed successfully`)
  } catch (err) {
    console.error('[bg-process] Background processing error:', err)

    if (materialId) {
      try {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        await supabase
          .from('materials')
          .update({
            processing_status: 'failed',
            processing_error: (err as Error).message,
          })
          .eq('id', materialId)
      } catch (updateErr) {
        console.error('[bg-process] Failed to update material status:', updateErr)
      }
    }
  }
}

export const config = {
  path: '/.netlify/functions/process-material-background',
}
