import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!
const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ENV_ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS])]

interface Concept {
  id: string
  title: string
  key_facts: string | null
  sort_order: number
  section_id: string
}

interface MasteryRow {
  concept_id: string
  status: string
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
    return new Response(null, { headers: buildCorsHeaders(origin) })
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401, origin)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401, origin)
    }

    const { material_id, session_id } = await req.json()
    if (!material_id || !session_id) {
      return jsonResponse({ error: 'Missing material_id or session_id' }, 400, origin)
    }

    const [
      profileRes,
      sessionRes,
      materialRes,
      chaptersRes,
      sectionsRes,
      conceptsRes,
      masteryRes,
      questionsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('sessions').select('id, user_id, material_id, session_type, current_chapter_id, current_section_id, current_concept_id').eq('id', session_id).single(),
      supabase.from('materials').select('id, user_id, extracted_text').eq('id', material_id).single(),
      supabase.from('chapters').select('*').eq('material_id', material_id).order('sort_order'),
      supabase.from('sections').select('*').order('sort_order'),
      supabase.from('concepts').select('*').order('sort_order'),
      supabase.from('mastery_state').select('concept_id, status').eq('user_id', user.id),
      supabase.from('professor_questions').select('*').eq('user_id', user.id),
    ])

    const profile = profileRes.data
    const session = sessionRes.data
    const material = materialRes.data

    if (!profile || !session || !material) {
      return jsonResponse({ error: 'Profile, session, or material not found' }, 404, origin)
    }

    if (
      session.user_id !== user.id ||
      material.user_id !== user.id ||
      session.material_id !== material_id
    ) {
      return jsonResponse({ error: 'Forbidden' }, 403, origin)
    }

    const materialText = material.extracted_text ?? ''
    const chapters = chaptersRes.data ?? []
    const allSections = sectionsRes.data ?? []
    const allConcepts = (conceptsRes.data ?? []) as Concept[]
    const allMastery = (masteryRes.data ?? []) as MasteryRow[]
    const allQuestions = questionsRes.data ?? []

    const chapterIds = new Set(chapters.map((c: { id: string }) => c.id))
    const sections = allSections.filter((s: { chapter_id: string }) => chapterIds.has(s.chapter_id))
    const sectionIds = new Set(sections.map((s: { id: string }) => s.id))
    const concepts = allConcepts.filter((c) => sectionIds.has(c.section_id))
    const questions = allQuestions.filter((q: { chapter_id: string }) => chapterIds.has(q.chapter_id))

    const conceptIds = new Set(concepts.map((c) => c.id))
    const mastery = allMastery.filter((m) => conceptIds.has(m.concept_id))
    const masteryMap = new Map(mastery.map((m) => [m.concept_id, m.status]))

    const totalConcepts = concepts.length
    const masteredCount = mastery.filter((m) => m.status === 'mastered').length
    const strugglingConcepts = concepts.filter((c) => masteryMap.get(c.id) === 'struggling')
    const skippedConcepts = concepts.filter((c) => masteryMap.get(c.id) === 'skipped')
    const inProgressConcepts = concepts.filter((c) => masteryMap.get(c.id) === 'in_progress')

    let lastConceptCompleted = 'None'
    let currentConceptInProgress = 'None'
    if (session.current_concept_id) {
      const currentConcept = concepts.find((c) => c.id === session.current_concept_id)
      if (currentConcept) {
        const status = masteryMap.get(currentConcept.id) ?? 'not_started'
        if (status === 'mastered') {
          lastConceptCompleted = currentConcept.title
        } else {
          currentConceptInProgress = currentConcept.title
          const idx = concepts.indexOf(currentConcept)
          for (let i = idx - 1; i >= 0; i--) {
            if (masteryMap.get(concepts[i].id) === 'mastered') {
              lastConceptCompleted = concepts[i].title
              break
            }
          }
        }
      }
    } else {
      for (let i = concepts.length - 1; i >= 0; i--) {
        const status = masteryMap.get(concepts[i].id)
        if (status === 'in_progress' || status === 'struggling') {
          currentConceptInProgress = concepts[i].title
          for (let j = i - 1; j >= 0; j--) {
            if (masteryMap.get(concepts[j].id) === 'mastered') {
              lastConceptCompleted = concepts[j].title
              break
            }
          }
          break
        }
        if (status === 'mastered') {
          lastConceptCompleted = concepts[i].title
          break
        }
      }
    }

    const currentChapter = session.current_chapter_id
      ? chapters.find((c: { id: string; title: string }) => c.id === session.current_chapter_id)?.title ?? 'Start'
      : chapters[0]?.title ?? 'None'

    const currentSection = session.current_section_id
      ? sections.find((s: { id: string; title: string }) => s.id === session.current_section_id)?.title ?? 'Start'
      : 'Start'

    const lessonPlan = chapters.map((chapter: { id: string; title: string; sort_order: number }) => ({
      chapter_id: chapter.id,
      chapter: chapter.title,
      sections: sections
        .filter((s: { chapter_id: string }) => s.chapter_id === chapter.id)
        .map((section: { id: string; title: string }) => ({
          section_id: section.id,
          section: section.title,
          concepts: concepts
            .filter((c) => c.section_id === section.id)
            .map((concept) => ({
              concept_id: concept.id,
              title: concept.title,
              key_facts: concept.key_facts,
              mastery: masteryMap.get(concept.id) ?? 'not_started',
            })),
        })),
    }))

    const professorQuestions = questions.map((q: { question_text: string; question_type: string | null; suggested_placement: string | null }) => ({
      question: q.question_text,
      type: q.question_type,
      placement: q.suggested_placement,
    }))

    const mastery_summary = `${masteredCount}/${totalConcepts} mastered, ${strugglingConcepts.length} struggling, ${inProgressConcepts.length} in progress, ${skippedConcepts.length} skipped, ${totalConcepts - masteredCount - strugglingConcepts.length - inProgressConcepts.length - skippedConcepts.length} not started`

    const { data: lastSessionData } = await supabase
      .from('sessions')
      .select('started_at, ended_at')
      .eq('user_id', user.id)
      .eq('material_id', material_id)
      .neq('id', session_id)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1)

    let daysSinceLastSession = 'first session'
    if (lastSessionData?.length) {
      const lastDate = new Date(lastSessionData[0].ended_at)
      const now = new Date()
      const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      daysSinceLastSession = diffDays === 0 ? 'today' : `${diffDays}`
    }

    const dynamicVariables = {
      user_id: user.id,
      session_id,
      student_name: profile.first_name,
      education_level: profile.education_level,
      session_type: session.session_type,
      days_since_last_session: daysSinceLastSession,
      mastery_summary,
      concepts_struggling: strugglingConcepts.map((c) => c.title).join(', ') || 'None',
      concepts_skipped: skippedConcepts.map((c) => c.title).join(', ') || 'None',
      last_concept_completed: lastConceptCompleted,
      current_concept_in_progress: currentConceptInProgress,
      current_chapter: currentChapter,
      current_section: currentSection,
      lesson_plan: JSON.stringify(lessonPlan),
      professor_questions: JSON.stringify(professorQuestions),
      study_material: materialText.slice(0, 30000),
    }

    const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`
    const elevenLabsRes = await fetch(url, {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    })

    if (!elevenLabsRes.ok) {
      const errorText = await elevenLabsRes.text()
      return jsonResponse({ error: `ElevenLabs API error: ${errorText}` }, 502, origin)
    }

    const { signed_url } = await elevenLabsRes.json()
    return jsonResponse({ signed_url, dynamic_variables: dynamicVariables }, 200, origin)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500, origin)
  }
})
