import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.80.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const ENV_ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'https://voice-ai-tutor.netlify.app']
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS])]

const CHUNK_SIZE = 15_000
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

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...buildCorsHeaders(origin),
    },
  })
}

/**
 * Split text into chunks of up to CHUNK_SIZE characters, breaking at paragraph
 * boundaries when possible. Each chunk (after the first) is prefixed with
 * OVERLAP_SIZE characters from the end of the previous chunk so Claude has
 * continuity context.
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]

  const chunks: string[] = []
  let offset = 0

  while (offset < text.length) {
    let end = Math.min(offset + CHUNK_SIZE, text.length)

    // Try to break at a paragraph boundary (double newline) within the last 20% of the chunk
    if (end < text.length) {
      const searchStart = offset + Math.floor(CHUNK_SIZE * 0.8)
      const breakZone = text.slice(searchStart, end)
      const lastParagraph = breakZone.lastIndexOf('\n\n')
      if (lastParagraph !== -1) {
        end = searchStart + lastParagraph + 2
      }
    }

    chunks.push(text.slice(offset, end))

    // Next chunk starts OVERLAP_SIZE characters before the end of this one
    offset = Math.max(end - OVERLAP_SIZE, offset + 1)
    if (end >= text.length) break
  }

  return chunks
}

/**
 * Call Claude for a single chunk and return the parsed StructuredPlan.
 */
async function processChunk(
  anthropic: InstanceType<typeof Anthropic>,
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
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { type: string; text: string }) => block.text)
    .join('')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Claude did not return valid JSON for chunk ${chunkIndex + 1}`)
  }

  return JSON.parse(jsonMatch[0]) as StructuredPlan
}

/**
 * Merge multiple StructuredPlan results into one. Chapters and sections with
 * identical titles are combined; concepts are deduplicated by title within
 * each section. Sort orders are renumbered sequentially.
 */
function mergePlans(plans: StructuredPlan[]): StructuredPlan {
  if (plans.length === 1) return plans[0]

  // Map: chapter title -> { chapter, sections map }
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

  // Rebuild with sequential sort_order values
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

  // Deduplicate questions by text
  const seenQuestions = new Set<string>()
  const uniqueQuestions = allQuestions.filter((q) => {
    if (seenQuestions.has(q.question_text)) return false
    seenQuestions.add(q.question_text)
    return true
  })

  return { chapters, professor_questions: uniqueQuestions.length ? uniqueQuestions : undefined }
}

async function processInBackground(
  materialId: string,
  userId: string,
  textContent: string,
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const text = textContent.length > MAX_TOTAL_CHARS
      ? textContent.slice(0, MAX_TOTAL_CHARS) + '\n\n[Content truncated due to length]'
      : textContent

    const chunks = splitTextIntoChunks(text)
    console.log(`Processing material ${materialId}: ${text.length} chars, ${chunks.length} chunk(s)`)

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    // Process chunks sequentially to avoid rate limits and keep ordering predictable
    const chunkResults: StructuredPlan[] = []
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const result = await processChunk(anthropic, chunks[i], i, chunks.length)
      chunkResults.push(result)
    }

    const plan = mergePlans(chunkResults)

    if (!plan.chapters?.length) {
      throw new Error('No chapters found in structured plan')
    }

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

      chapterMap.set(chapter.title, { id: chapterRow.id, sectionMap: new Map<string, string>() })

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

    await supabase
      .from('materials')
      .update({ processing_status: 'completed' })
      .eq('id', materialId)

    console.log(`Material ${materialId} processing completed successfully`)
  } catch (err) {
    console.error('Background processing error:', err)

    await supabase
      .from('materials')
      .update({
        processing_status: 'failed',
        processing_error: (err as Error).message,
      })
      .eq('id', materialId)
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: buildCorsHeaders(origin),
    })
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401, origin)
  }

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid token' }, 401, origin)
  }

  const { material_id, text_content } = await req.json()
  if (!material_id || !text_content) {
    return jsonResponse({ error: 'Missing material_id or text_content' }, 400, origin)
  }

  const { data: material, error: matError } = await supabase
    .from('materials')
    .select('id, user_id')
    .eq('id', material_id)
    .single()

  if (matError || !material || material.user_id !== user.id) {
    return jsonResponse({ error: 'Material not found' }, 404, origin)
  }

  // Rate limit: max 10 materials processed per user per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await supabase
    .from('materials')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneHourAgo)

  if (recentCount != null && recentCount >= 10) {
    return jsonResponse({ error: 'Rate limit exceeded. Please wait before uploading more materials.' }, 429, origin)
  }

  await supabase
    .from('materials')
    .update({ processing_status: 'processing' })
    .eq('id', material_id)

  // Hand off the chunked Claude API calls and DB writes to run after the response is sent.
  // This avoids the 150-second edge function timeout killing long-running processing.
  EdgeRuntime.waitUntil(processInBackground(material_id, user.id, text_content))

  return jsonResponse({ accepted: true, material_id }, 202, origin)
})
