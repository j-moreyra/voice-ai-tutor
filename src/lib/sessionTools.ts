import { supabase } from './supabase'
import type { MasteryStatus, ChapterResult } from '../types/database'

interface UpdateSessionStateParams {
  concept_updates?: Array<{ concept_id: string; status: MasteryStatus }>
  section_completed?: string
  chapter_result?: { chapter_id: string; result: ChapterResult }
  position?: { chapter_id: string; section_id: string; concept_id: string }
}

export function createSessionToolHandler(userId: string, sessionId: string) {
  return async (params: UpdateSessionStateParams): Promise<string> => {
    try {
      const errors: string[] = []

      if (params.concept_updates?.length) {
        const rows = params.concept_updates.map((u) => ({
          concept_id: u.concept_id,
          user_id: userId,
          status: u.status,
        }))
        const { error } = await supabase
          .from('mastery_state')
          .upsert(rows, { onConflict: 'concept_id,user_id' })
        if (error) errors.push(`mastery update failed: ${error.message}`)
      }

      if (params.section_completed) {
        const { error } = await supabase
          .from('session_sections_completed')
          .insert({
            session_id: sessionId,
            section_id: params.section_completed,
            user_id: userId,
          })
        if (error) errors.push(`section_completed failed: ${error.message}`)
      }

      if (params.chapter_result) {
        const { error } = await supabase
          .from('chapter_results')
          .upsert(
            {
              chapter_id: params.chapter_result.chapter_id,
              user_id: userId,
              result: params.chapter_result.result,
            },
            { onConflict: 'chapter_id,user_id' }
          )
        if (error) errors.push(`chapter_result failed: ${error.message}`)
      }

      if (params.position) {
        const { error } = await supabase
          .from('sessions')
          .update({
            current_chapter_id: params.position.chapter_id,
            current_section_id: params.position.section_id,
            current_concept_id: params.position.concept_id,
          })
          .eq('id', sessionId)
        if (error) errors.push(`position update failed: ${error.message}`)
      }

      if (errors.length) {
        console.error('Session tool handler errors:', errors)
        return `error: ${errors.join('; ')}`
      }

      return 'ok'
    } catch (err) {
      console.error('Session tool handler error:', err)
      return `error: ${(err as Error).message}`
    }
  }
}
