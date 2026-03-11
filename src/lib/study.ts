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
  const [materialRes, chaptersRes, sectionsRes, conceptsRes, masteryRes, resultsRes] =
    await Promise.all([
      supabase.from('materials').select('*').eq('id', materialId).eq('user_id', userId).single(),
      supabase.from('chapters').select('*').eq('material_id', materialId).order('sort_order'),
      supabase.from('sections').select('*').order('sort_order'),
      supabase.from('concepts').select('*').order('sort_order'),
      supabase.from('mastery_state').select('*').eq('user_id', userId),
      supabase.from('chapter_results').select('*').eq('user_id', userId),
    ])

  const material = materialRes.data as Material | null
  if (!material) return null

  const chapters = (chaptersRes.data as Chapter[]) ?? []
  const allSections = (sectionsRes.data as Section[]) ?? []
  const allConcepts = (conceptsRes.data as Concept[]) ?? []
  const allMastery = (masteryRes.data as MasteryState[]) ?? []
  const allResults = (resultsRes.data as ChapterResultRecord[]) ?? []

  const chapterIds = new Set(chapters.map((c) => c.id))
  const sections = allSections.filter((s) => chapterIds.has(s.chapter_id))
  const sectionIds = new Set(sections.map((s) => s.id))
  const concepts = allConcepts.filter((c) => sectionIds.has(c.section_id))

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
      onUpdate
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chapter_results',
        filter: `user_id=eq.${userId}`,
      },
      onUpdate
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
