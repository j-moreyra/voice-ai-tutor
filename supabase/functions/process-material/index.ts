import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders, isOriginAllowed, parseAllowedOrigins } from '../_shared/cors.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'), DEFAULT_ALLOWED_ORIGINS)

const STRUCTURING_PROMPT = `You are a curriculum structuring assistant. Analyze the following text extracted from a study material and produce a structured JSON study plan.

Rules:
- Create logical chapters based on major topics or existing chapter/section headings
- Each chapter should have 2-5 sections
- Each section should have 2-8 concepts (individual teachable units)
- For each concept, extract key_facts: important definitions, formulas, relationships, or facts
- If the text contains questions (homework, review, exam questions), extract them as professor_questions
- Preserve the natural ordering of the material
- Keep titles concise but descriptive

Respond with ONLY valid JSON matching this schema:
{
  "chapters": [
    {
      "title": "Chapter Title",
      "sort_order": 0,
      "sections": [
        {
          "title": "Section Title",
          "sort_order": 0,
          "concepts": [
            {
              "title": "Concept Title",
              "key_facts": "Key facts, definitions, formulas as a text block",
              "sort_order": 0
            }
          ]
        }
      ],
      "questions": [
        {
          "question_text": "The question text",
          "question_type": "recall",
          "suggested_placement": "section_quiz",
          "section_title": "Section Title or null if chapter-level"
        }
      ]
    }
  ]
}`

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
  questions?: {
    question_text: string
    question_type: string | null
    suggested_placement: string | null
    section_title: string | null
  }[]
}

interface StructuredPlan {
  chapters: StructuredChapter[]
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...buildCorsHeaders(origin, ALLOWED_ORIGINS),
    },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: buildCorsHeaders(origin, ALLOWED_ORIGINS),
    })
  }

  if (origin && !isOriginAllowed(origin, ALLOWED_ORIGINS)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin)
  }


  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
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

  await supabase
    .from('materials')
    .update({ processing_status: 'processing' })
    .eq('id', material_id)

  try {
    const maxChars = 400_000
    const text = text_content.length > maxChars
      ? text_content.slice(0, maxChars) + '\n\n[Content truncated due to length]'
      : text_content

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `${STRUCTURING_PROMPT}\n\n---\n\nHere is the extracted text:\n\n${text}`,
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

    for (const chapter of plan.chapters) {
      const { data: chapterRow, error: chapterErr } = await supabase
        .from('chapters')
        .insert({
          material_id,
          user_id: user.id,
          title: chapter.title,
          sort_order: chapter.sort_order,
        })
        .select('id')
        .single()

      if (chapterErr || !chapterRow) {
        console.error('Failed to insert chapter:', chapterErr)
        continue
      }

      const sectionMap = new Map<string, string>()

      for (const section of chapter.sections) {
        const { data: sectionRow, error: sectionErr } = await supabase
          .from('sections')
          .insert({
            chapter_id: chapterRow.id,
            user_id: user.id,
            title: section.title,
            sort_order: section.sort_order,
          })
          .select('id')
          .single()

        if (sectionErr || !sectionRow) {
          console.error('Failed to insert section:', sectionErr)
          continue
        }

        sectionMap.set(section.title, sectionRow.id)

        if (section.concepts.length) {
          const conceptRows = section.concepts.map((c) => ({
            section_id: sectionRow.id,
            user_id: user.id,
            title: c.title,
            key_facts: c.key_facts,
            sort_order: c.sort_order,
          }))

          const { error: conceptErr } = await supabase.from('concepts').insert(conceptRows)
          if (conceptErr) console.error('Failed to insert concepts:', conceptErr)
        }
      }

      if (chapter.questions?.length) {
        const questionRows = chapter.questions.map((q) => ({
          chapter_id: chapterRow.id,
          section_id: q.section_title ? sectionMap.get(q.section_title) ?? null : null,
          user_id: user.id,
          question_text: q.question_text,
          question_type: q.question_type,
          suggested_placement: q.suggested_placement,
        }))

        const { error: qErr } = await supabase.from('professor_questions').insert(questionRows)
        if (qErr) console.error('Failed to insert questions:', qErr)
      }
    }

    await supabase
      .from('materials')
      .update({ processing_status: 'completed' })
      .eq('id', material_id)

    return jsonResponse({ success: true }, 200, origin)
  } catch (err) {
    console.error('Processing error:', err)

    await supabase
      .from('materials')
      .update({
        processing_status: 'failed',
        processing_error: (err as Error).message,
      })
      .eq('id', material_id)

    return jsonResponse({ error: (err as Error).message }, 500, origin)
  }
})
