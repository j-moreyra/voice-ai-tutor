import { supabase } from './supabase'
import type { MasteryStatus, ChapterResult } from '../types/database'

interface UpdateSessionStateParams {
  concept_updates?: Array<{ concept_id: string; status: MasteryStatus }>
  section_completed?: string
  chapter_result?: { chapter_id: string; result: ChapterResult }
  position?: { chapter_id: string; section_id: string; concept_id: string }
}

// Valid mastery transitions enforced by the validate_mastery_transition trigger.
// If the agent skips a step (e.g. not_started → mastered), we insert the
// intermediate state first so the trigger doesn't reject the update.
const NEEDS_IN_PROGRESS_FIRST = new Set<MasteryStatus>(['mastered', 'struggling'])

export function createSessionToolHandler(userId: string, sessionId: string) {
  return async (params: UpdateSessionStateParams): Promise<string> => {
    try {
      const warnings: string[] = []

      // Process concept updates individually so one trigger rejection
      // doesn't block all other updates in the batch.
      if (params.concept_updates?.length) {
        for (const update of params.concept_updates) {
          try {
            // If the target status requires in_progress as an intermediate
            // step, ensure that state exists first. This handles the case
            // where the agent marks a concept mastered without first setting
            // it to in_progress (which the DB trigger would reject).
            if (NEEDS_IN_PROGRESS_FIRST.has(update.status)) {
              await supabase
                .from('mastery_state')
                .upsert(
                  { concept_id: update.concept_id, user_id: userId, status: 'in_progress' as MasteryStatus },
                  { onConflict: 'concept_id,user_id', ignoreDuplicates: true }
                )
            }

            const { error } = await supabase
              .from('mastery_state')
              .upsert(
                { concept_id: update.concept_id, user_id: userId, status: update.status },
                { onConflict: 'concept_id,user_id' }
              )
            if (error) {
              console.warn(`Mastery update failed for ${update.concept_id}:`, error.message)
              warnings.push(`mastery(${update.concept_id}): ${error.message}`)
            }
          } catch (err) {
            console.warn(`Mastery update exception for ${update.concept_id}:`, err)
          }
        }
      }

      if (params.section_completed) {
        const { error } = await supabase
          .from('session_sections_completed')
          .upsert(
            {
              session_id: sessionId,
              section_id: params.section_completed,
              user_id: userId,
            },
            { onConflict: 'session_id,section_id' }
          )
        if (error) {
          console.warn('section_completed failed:', error.message)
          warnings.push(`section_completed: ${error.message}`)
        }
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
        if (error) {
          console.warn('chapter_result failed:', error.message)
          warnings.push(`chapter_result: ${error.message}`)
        }
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
        if (error) {
          console.warn('position update failed:', error.message)
          warnings.push(`position: ${error.message}`)
        }
      }

      // Always return 'ok' to the agent to prevent it from ending the
      // conversation due to tool errors. Warnings are logged client-side
      // for debugging but don't disrupt the session flow.
      if (warnings.length) {
        console.error('Session tool handler warnings:', warnings)
      }

      return 'ok'
    } catch (err) {
      console.error('Session tool handler error:', err)
      // Even on unexpected errors, return 'ok' to keep the session alive.
      // The agent can't fix DB issues, so crashing the session doesn't help.
      return 'ok'
    }
  }
}
