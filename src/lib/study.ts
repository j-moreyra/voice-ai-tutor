import { supabase } from './supabase'
import type {
  Material,
  Chapter,
  Section,
  Concept,
  MasteryState,
  MasteryStatus,
  ChapterResult,
  ChapterResultRecord,
} from '../types/database'

export interface StudyConcept extends Concept {
  mastery: MasteryStatus
}

export interface StudySection extends Section {
  concepts: StudyConcept[]
}

export interface StudyChapter extends Chapter {
  result: ChapterResult | null
  sections: StudySection[]
}

export interface StudyStats {
  total: number
  mastered: number
  inProgress: number
  struggling: number
  notStarted: number
  skipped: number
}

export interface StudyPlan {
  material: Material
  chapters: StudyChapter[]
  stats: StudyStats
}

export async function fetchStudyPlan(userId: string, materialId: string): Promise<StudyPlan | null> {
  const [materialRes, chaptersRes, masteryRes, resultsRes] = await Promise.all([
    supabase.from('materials').select('*').eq('id', materialId).eq('user_id', userId).single(),
    supabase.from('chapters').select('*').eq('material_id', materialId).order('sort_order'),
    supabase.from('mastery_state').select('*').eq('user_id', userId),
    supabase.from('chapter_results').select('*').eq('user_id', userId),
  ])

  const material = materialRes.data as Material | null
  if (!material) return null

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
  const allMastery = (masteryRes.data as MasteryState[]) ?? []
  const allResults = (resultsRes.data as ChapterResultRecord[]) ?? []

  const masteryMap = new Map(allMastery.map((m) => [m.concept_id, m.status]))
  const resultMap = new Map(allResults.map((r) => [r.chapter_id, r.result]))

  const studyChapters: StudyChapter[] = chapters.map((chapter) => ({
    ...chapter,
    result: resultMap.get(chapter.id) ?? null,
    sections: sections
      .filter((s) => s.chapter_id === chapter.id)
      .map((section) => ({
        ...section,
        concepts: concepts
          .filter((c) => c.section_id === section.id)
          .map((concept) => ({
            ...concept,
            mastery: masteryMap.get(concept.id) ?? 'not_started',
          })),
      })),
  }))

  const stats: StudyStats = { total: 0, mastered: 0, inProgress: 0, struggling: 0, notStarted: 0, skipped: 0 }
  for (const ch of studyChapters) {
    for (const s of ch.sections) {
      for (const c of s.concepts) {
        stats.total++
        if (c.mastery === 'mastered') stats.mastered++
        else if (c.mastery === 'in_progress') stats.inProgress++
        else if (c.mastery === 'struggling') stats.struggling++
        else if (c.mastery === 'not_started') stats.notStarted++
        else if (c.mastery === 'skipped') stats.skipped++
      }
    }
  }

  return { material, chapters: studyChapters, stats }
}

export function subscribeStudyPlan(userId: string, materialId: string, onUpdate: () => void) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let chapterIds = new Set<string>()
  let conceptIds = new Set<string>()

  void (async () => {
    const chaptersRes = await supabase
      .from('chapters')
      .select('id')
      .eq('material_id', materialId)

    const chapters = (chaptersRes.data as Array<{ id: string }> | null) ?? []
    chapterIds = new Set(chapters.map((c) => c.id))

    if (!chapterIds.size) return

    const sectionsRes = await supabase
      .from('sections')
      .select('id')
      .in('chapter_id', Array.from(chapterIds))

    const sectionIds = ((sectionsRes.data as Array<{ id: string }> | null) ?? []).map((s) => s.id)
    if (!sectionIds.length) return

    const conceptsRes = await supabase
      .from('concepts')
      .select('id')
      .in('section_id', sectionIds)

    conceptIds = new Set(((conceptsRes.data as Array<{ id: string }> | null) ?? []).map((c) => c.id))
  })()

  const debouncedUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      onUpdate()
    }, 250)
  }

  const handleMasteryEvent = (payload: { new?: { concept_id?: string }; old?: { concept_id?: string } }) => {
    const conceptId = payload.new?.concept_id ?? payload.old?.concept_id
    if (conceptIds.size && conceptId && !conceptIds.has(conceptId)) return
    debouncedUpdate()
  }

  const handleChapterResultEvent = (payload: { new?: { chapter_id?: string }; old?: { chapter_id?: string } }) => {
    const chapterId = payload.new?.chapter_id ?? payload.old?.chapter_id
    if (chapterIds.size && chapterId && !chapterIds.has(chapterId)) return
    debouncedUpdate()
  }

  const channel = supabase
    .channel(`study-${materialId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'mastery_state',
        filter: `user_id=eq.${userId}`,
      },
      handleMasteryEvent
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chapter_results',
        filter: `user_id=eq.${userId}`,
      },
      handleChapterResultEvent
    )
    .subscribe()

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    supabase.removeChannel(channel)
  }
}
