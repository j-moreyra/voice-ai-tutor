import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!
const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
    }

    const { material_id, session_id } = await req.json()
    if (!material_id || !session_id) {
      return new Response(JSON.stringify({ error: 'Missing material_id or session_id' }), { status: 400 })
    }

    // Fetch all context from DB in parallel
    const [profileRes, sessionRes, materialRes, chaptersRes, sectionsRes, conceptsRes, masteryRes, questionsRes] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('sessions').select('*').eq('id', session_id).single(),
        supabase.from('materials').select('extracted_text').eq('id', material_id).single(),
        supabase.from('chapters').select('*').eq('material_id', material_id).order('sort_order'),
        supabase.from('sections').select('*').order('sort_order'),
        supabase.from('concepts').select('*').order('sort_order'),
        supabase.from('mastery_state').select('concept_id, status').eq('user_id', user.id),
        supabase.from('professor_questions').select('*').eq('user_id', user.id),
      ])

    const profile = profileRes.data
    const session = sessionRes.data
    const materialText = materialRes.data?.extracted_text ?? ''
    const chapters = chaptersRes.data ?? []
    const allSections = sectionsRes.data ?? []
    const allConcepts = (conceptsRes.data ?? []) as Concept[]
    const allMastery = (masteryRes.data ?? []) as MasteryRow[]
    const allQuestions = questionsRes.data ?? []

    if (!profile || !session) {
      return new Response(JSON.stringify({ error: 'Profile or session not found' }), { status: 404 })
    }

    // Filter to this material's hierarchy
    const chapterIds = new Set(chapters.map((c: { id: string }) => c.id))
    const sections = allSections.filter((s: { chapter_id: string }) => chapterIds.has(s.chapter_id))
    const sectionIds = new Set(sections.map((s: { id: string }) => s.id))
    const concepts = allConcepts.filter((c) => sectionIds.has(c.section_id))
    const questions = allQuestions.filter((q: { chapter_id: string }) => chapterIds.has(q.chapter_id))

    // Build mastery map
    const conceptIds = new Set(concepts.map((c) => c.id))
    const mastery = allMastery.filter((m) => conceptIds.has(m.concept_id))
    const masteryMap = new Map(mastery.map((m) => [m.concept_id, m.status]))

    // Compute dynamic variables
    const totalConcepts = concepts.length
    const masteredCount = mastery.filter((m) => m.status === 'mastered').length
    const strugglingConcepts = concepts.filter((c) => masteryMap.get(c.id) === 'struggling')
    const skippedConcepts = concepts.filter((c) => masteryMap.get(c.id) === 'skipped')
    const inProgressConcepts = concepts.filter((c) => masteryMap.get(c.id) === 'in_progress')

    // Find last completed concept (last concept with mastered/struggling status by sort order)
    let lastConceptCompleted = 'None'
    if (session.current_concept_id) {
      const currentConcept = concepts.find((c) => c.id === session.current_concept_id)
      if (currentConcept) lastConceptCompleted = currentConcept.title
    }

    // Current position
    const currentChapter = session.current_chapter_id
      ? chapters.find((c: { id: string; title: string }) => c.id === session.current_chapter_id)?.title ?? 'Start'
      : chapters[0]?.title ?? 'None'

    const currentSection = session.current_section_id
      ? sections.find((s: { id: string; title: string }) => s.id === session.current_section_id)?.title ?? 'Start'
      : 'Start'

    // Build lesson plan structure (IDs included so the agent can reference
    // them in update_session_state tool calls)
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

    // Format professor questions
    const professorQuestions = questions.map((q: { question_text: string; question_type: string | null; suggested_placement: string | null }) => ({
      question: q.question_text,
      type: q.question_type,
      placement: q.suggested_placement,
    }))

    const mastery_summary = `${masteredCount}/${totalConcepts} mastered, ${strugglingConcepts.length} struggling, ${inProgressConcepts.length} in progress, ${skippedConcepts.length} skipped, ${totalConcepts - masteredCount - strugglingConcepts.length - inProgressConcepts.length - skippedConcepts.length} not started`

    // Compute days since last completed session (exclude orphaned sessions
    // that were never properly ended, to avoid stale/incorrect values)
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

    // Build dynamic variables for ElevenLabs
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
      current_chapter: currentChapter,
      current_section: currentSection,
      lesson_plan: JSON.stringify(lessonPlan),
      professor_questions: JSON.stringify(professorQuestions),
      study_material: materialText.slice(0, 30000),
    }

    // Request signed URL from ElevenLabs
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`
    const elevenLabsRes = await fetch(url, {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    })

    if (!elevenLabsRes.ok) {
      const errorText = await elevenLabsRes.text()
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${errorText}` }),
        { status: 502 }
      )
    }

    const { signed_url } = await elevenLabsRes.json()

    // Return signed URL + dynamic variables separately
    // Dynamic variables are passed client-side to Conversation.startSession()
    return new Response(
      JSON.stringify({ signed_url, dynamic_variables: dynamicVariables }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
