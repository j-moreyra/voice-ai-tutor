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

const MAX_OUTPUT_TOKENS = 5_000

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
    return new Response(null, { headers: buildCorsHeaders(origin) })
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
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid token' }, 401, origin)
  }

  const body = await req.json()
  const { material_id, chunk_text, chunk_index, total_chunks } = body
  if (!material_id || !chunk_text || chunk_index == null || !total_chunks) {
    return jsonResponse({ error: 'Missing required fields: material_id, chunk_text, chunk_index, total_chunks' }, 400, origin)
  }

  const { data: material, error: matError } = await supabase
    .from('materials')
    .select('id, user_id')
    .eq('id', material_id)
    .single()

  if (matError || !material || material.user_id !== user.id) {
    return jsonResponse({ error: 'Material not found' }, 404, origin)
  }

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const chunkContext = total_chunks > 1
      ? `\n\nIMPORTANT CONTEXT: This is chunk ${chunk_index + 1} of ${total_chunks} from a larger document. Process ONLY the content in this chunk. Use sort_order values starting from ${chunk_index * 1000} so they can be merged with other chunks later. If a chapter or section appears to continue from a previous chunk, use the EXACT same title so chunks can be merged.\n\n---\n\nHere is the extracted text for this chunk:\n\n`
      : '\n\n---\n\nHere is the extracted text:\n\n'

    console.log(`[process-material] Chunk ${chunk_index + 1}/${total_chunks} (${chunk_text.length} chars)`)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'user', content: `${PROCESSING_PROMPT}${chunkContext}${chunk_text}` }],
    })

    const responseText = message.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { type: string; text: string }) => block.text)
      .join('')

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return jsonResponse({ error: `Claude did not return valid JSON for chunk ${chunk_index + 1}` }, 502, origin)
    }

    const plan = JSON.parse(jsonMatch[0])
    console.log(`[process-material] Chunk ${chunk_index + 1} done: ${plan.chapters?.length ?? 0} chapters`)

    return jsonResponse(plan, 200, origin)
  } catch (err) {
    const errObj = err as { status?: number; message?: string; headers?: Record<string, string> }

    if (errObj.status === 429) {
      const retryAfter = errObj.headers?.['retry-after'] ?? '60'
      return jsonResponse(
        { error: 'rate_limited', retry_after: parseInt(retryAfter, 10) || 60 },
        429,
        origin,
      )
    }

    console.error('[process-material] Anthropic error:', err)
    return jsonResponse({ error: (err as Error).message }, 500, origin)
  }
})
