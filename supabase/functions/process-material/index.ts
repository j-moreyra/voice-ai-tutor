import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.80.0'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const ENV_ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'https://voice-ai-tutor.netlify.app']
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS])]

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

interface StructuredPlan {
  chapters: StructuredChapter[]
  professor_questions?: {
    question_text: string
    question_type: string | null
    suggested_placement: string | null
    chapter_title: string | null
    section_title: string | null
  }[]
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
    console.error('[process-material] Missing Authorization header')
    return jsonResponse({ error: 'Missing authorization' }, 401, origin)
  }

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)
  if (authError || !user) {
    console.error('[process-material] Auth failed', { authError: authError?.message })
    return jsonResponse({ error: 'Invalid token' }, 401, origin)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (e) {
    console.error('[process-material] Failed to parse JSON body', {
      error: (e as Error).message,
      contentType: req.headers.get('content-type'),
      contentLength: req.headers.get('content-length'),
    })
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin)
  }

  const material_id = typeof body.material_id === 'string' ? body.material_id : undefined
  const text_content = typeof body.text_content === 'string' ? body.text_content : undefined

  console.log('[process-material] Request received', {
    user_id: user.id,
    body_keys: Object.keys(body),
    material_id_present: !!material_id,
    text_content_length: text_content?.length ?? 0,
    content_length: req.headers.get('content-length'),
    content_type: req.headers.get('content-type'),
  })

  if (!material_id || !text_content) {
    return jsonResponse({ error: 'Missing material_id or text_content' }, 400, origin)
  }

  const { data: material, error: matError } = await supabase
    .from('materials')
    .select('id, user_id')
    .eq('id', material_id)
    .single()

  if (matError || !material || material.user_id !== user.id) {
    console.error('[process-material] Material lookup failed', { material_id, matError: matError?.message })
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

  // Kick the heavy Claude call + DB inserts off in the background.
  // Edge Functions kill the worker at ~150s wall clock when the client is still
  // waiting, which was timing out large uploads. `waitUntil` decouples the
  // response from the work and lets it run with its own budget while the
  // Dashboard polls for status updates.
  const work = processInBackground(supabase, material_id, text_content, user.id)
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(work)
  } else {
    work.catch((err) => console.error('[process-material] Background work failed (no runtime)', err))
  }

  return jsonResponse({ accepted: true, material_id }, 202, origin)
})

async function processInBackground(
  supabase: SupabaseClient,
  material_id: string,
  text_content: string,
  user_id: string,
): Promise<void> {
  try {
    const maxChars = 400_000
    const text = text_content.length > maxChars
      ? text_content.slice(0, maxChars) + '\n\n[Content truncated due to length]'
      : text_content

    console.log('[process-material] Calling Claude', { material_id, text_length: text.length })

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: `${PROCESSING_PROMPT}\n\n---\n\nHere is the extracted text:\n\n${text}`,
        },
      ],
    })

    const responseText = message.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { type: string; text: string }) => block.text)
      .join('')

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON')
    }

    const plan: StructuredPlan = JSON.parse(jsonMatch[0])

    if (!plan.chapters?.length) {
      throw new Error('No chapters found in structured plan')
    }

    console.log('[process-material] Inserting structured plan', {
      material_id,
      chapter_count: plan.chapters.length,
      question_count: plan.professor_questions?.length ?? 0,
    })

    const chapterMap = new Map<string, { id: string; sectionMap: Map<string, string> }>()

    for (const chapter of plan.chapters) {
      const { data: chapterRow, error: chapterErr } = await supabase
        .from('chapters')
        .insert({
          material_id,
          user_id,
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
            user_id,
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
            user_id,
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
          user_id,
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
      .eq('id', material_id)

    console.log('[process-material] Completed', { material_id })
  } catch (err) {
    console.error('[process-material] Processing failed', err)

    await supabase
      .from('materials')
      .update({
        processing_status: 'failed',
        processing_error: (err as Error).message,
      })
      .eq('id', material_id)
  }
}
