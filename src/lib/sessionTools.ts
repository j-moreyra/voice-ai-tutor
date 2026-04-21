import { supabase } from './supabase'
import type { MasteryStatus, ChapterResult } from '../types/database'

interface UpdateSessionStateParams {
  concept_updates?: Array<{ concept_id: string; status: MasteryStatus }>
  section_completed?: string
  chapter_result?: { chapter_id: string; result: ChapterResult }
  position?: { chapter_id: string; section_id: string; concept_id: string }
}

// Tool return format: send a fresh mastery snapshot back to the agent on every
// successful write so it re-grounds on what's already covered. Without this
// the agent relies purely on conversation memory and drifts into re-teaching
// concepts that were already marked mastered earlier in the session.
async function buildStateSnapshot(userId: string, materialId: string): Promise<string> {
  try {
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id')
      .eq('material_id', materialId)

    const chapterIds = (chapters ?? []).map((c: { id: string }) => c.id)
    if (!chapterIds.length) return 'ok'

    const { data: sections } = await supabase
      .from('sections')
      .select('id')
      .in('chapter_id', chapterIds)

    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id)
    if (!sectionIds.length) return 'ok'

    const { data: concepts } = await supabase
      .from('concepts')
      .select('id, title')
      .in('section_id', sectionIds)

    const conceptIds = (concepts ?? []).map((c: { id: string }) => c.id)
    if (!conceptIds.length) return 'ok'

    const { data: mastery } = await supabase
      .from('mastery_state')
      .select('concept_id, status')
      .eq('user_id', userId)
      .in('concept_id', conceptIds)

    const titleMap = new Map((concepts ?? []).map((c: { id: string; title: string }) => [c.id, c.title]))
    const mastered: string[] = []
    const struggling: string[] = []
    const skipped: string[] = []
    const inProgress: string[] = []

    for (const row of (mastery ?? []) as Array<{ concept_id: string; status: string }>) {
      const title = titleMap.get(row.concept_id)
      if (!title) continue
      if (row.status === 'mastered') mastered.push(title)
      else if (row.status === 'struggling') struggling.push(title)
      else if (row.status === 'skipped') skipped.push(title)
      else if (row.status === 'in_progress') inProgress.push(title)
    }

    const parts: string[] = ['State saved.']
    if (mastered.length) {
      parts.push(`Already covered this session — DO NOT re-teach: ${mastered.join(', ')}.`)
    }
    if (inProgress.length) {
      parts.push(`Currently in progress: ${inProgress.join(', ')}.`)
    }
    if (struggling.length) {
      parts.push(`Struggling (revisit only if relevant to what you are teaching now): ${struggling.join(', ')}.`)
    }
    if (skipped.length) {
      parts.push(`Skipped — verify in the next assessment: ${skipped.join(', ')}.`)
    }

    return parts.length > 1 ? parts.join(' ') : 'ok'
  } catch {
    return 'ok'
  }
}

const RETRYABLE_ERROR_SNIPPETS = ['timeout', 'network', 'fetch', 'connection', 'temporar']

function isRetryableErrorMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return RETRYABLE_ERROR_SNIPPETS.some((snippet) => lower.includes(snippet))
}

async function runWithRetry<T>(op: () => PromiseLike<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!isRetryableErrorMessage(message)) throw err
    return await op()
  }
}

type WriteResult = { error?: { message: string } | null }

async function runWriteWithWarning(
  label: string,
  op: () => PromiseLike<WriteResult>,
  warnings: string[]
): Promise<boolean> {
  const result = await runWithRetry(op)
  const { error } = result as WriteResult
  if (error) {
    console.warn(`${label} failed:`, error.message)
    warnings.push(`${label}: ${error.message}`)
    return false
  }

  return true
}

function emitSessionToolWarnings(sessionId: string, warnings: string[]) {
  if (!warnings.length || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('session-tool-warnings', {
      detail: { sessionId, warnings },
    })
  )
}

function emitPositionChanged(sessionId: string, chapterTitle: string, sectionTitle: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('session-position-changed', {
      detail: { sessionId, chapterTitle, sectionTitle },
    })
  )
}

async function fetchPositionTitles(
  chapterId: string,
  sectionId: string
): Promise<{ chapterTitle: string; sectionTitle: string } | null> {
  try {
    const [chapterRes, sectionRes] = await Promise.all([
      supabase.from('chapters').select('title').eq('id', chapterId).single(),
      supabase.from('sections').select('title').eq('id', sectionId).single(),
    ])
    if (chapterRes.data && sectionRes.data) {
      return { chapterTitle: chapterRes.data.title, sectionTitle: sectionRes.data.title }
    }
  } catch {
    // Non-critical — labels just won't update
  }
  return null
}

// Valid mastery transitions enforced by the validate_mastery_transition trigger.
// If the agent skips a step (e.g. not_started → mastered), we insert the
// intermediate state first so the trigger doesn't reject the update.
const NEEDS_IN_PROGRESS_FIRST = new Set<MasteryStatus>(['mastered', 'struggling'])

export function createSessionToolHandler(userId: string, sessionId: string, materialId: string) {
  return async (params: UpdateSessionStateParams): Promise<string> => {
    try {
      const warnings: string[] = []
      const hadWrites = !!(
        params.concept_updates?.length ||
        params.section_completed ||
        params.chapter_result ||
        params.position
      )

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
              await runWriteWithWarning(
                `mastery(${update.concept_id})`,
                () =>
                supabase
                  .from('mastery_state')
                  .upsert(
                    { concept_id: update.concept_id, user_id: userId, status: 'in_progress' as MasteryStatus },
                    { onConflict: 'concept_id,user_id', ignoreDuplicates: true }
                  ),
                warnings
              )
            }

            await runWriteWithWarning(
              `mastery(${update.concept_id})`,
              () =>
                supabase
                  .from('mastery_state')
                  .upsert(
                    { concept_id: update.concept_id, user_id: userId, status: update.status },
                    { onConflict: 'concept_id,user_id' }
                  ),
              warnings
            )
          } catch (err) {
            console.warn(`Mastery update exception for ${update.concept_id}:`, err)
          }
        }
      }

      if (params.section_completed) {
        await runWriteWithWarning(
          'section_completed',
          () =>
            supabase
              .from('session_sections_completed')
              .upsert(
                {
                  session_id: sessionId,
                  section_id: params.section_completed,
                  user_id: userId,
                },
                { onConflict: 'session_id,section_id' }
              ),
          warnings
        )

        // Proactively update header labels to the next section so the UI
        // doesn't stay stale between section_completed and the first
        // concept_update in the new section.
        if (!params.position) {
          try {
            const { data: completed } = await supabase
              .from('sections')
              .select('chapter_id, sort_order')
              .eq('id', params.section_completed)
              .single()

            if (completed) {
              const { data: nextSection } = await supabase
                .from('sections')
                .select('id, title')
                .eq('chapter_id', completed.chapter_id)
                .gt('sort_order', completed.sort_order)
                .order('sort_order')
                .limit(1)
                .single()

              if (nextSection) {
                const { data: chapter } = await supabase
                  .from('chapters')
                  .select('title')
                  .eq('id', completed.chapter_id)
                  .single()

                if (chapter) {
                  emitPositionChanged(sessionId, chapter.title, nextSection.title)
                }
              }
            }
          } catch {
            // Non-critical — labels will update on next concept_update
          }
        }
      }

      if (params.chapter_result) {
        const chapterResult = params.chapter_result
        await runWriteWithWarning(
          'chapter_result',
          () =>
            supabase
              .from('chapter_results')
              .upsert(
                {
                  chapter_id: chapterResult.chapter_id,
                  user_id: userId,
                  result: chapterResult.result,
                },
                { onConflict: 'chapter_id,user_id' }
              ),
          warnings
        )
      }

      if (params.position) {
        const position = params.position
        await runWriteWithWarning(
          'position',
          () =>
            supabase
              .from('sessions')
              .update({
                current_chapter_id: position.chapter_id,
                current_section_id: position.section_id,
                current_concept_id: position.concept_id,
              })
              .eq('id', sessionId),
          warnings
        )
        const titles = await fetchPositionTitles(position.chapter_id, position.section_id)
        if (titles) emitPositionChanged(sessionId, titles.chapterTitle, titles.sectionTitle)
      } else if (params.concept_updates?.length) {
        // Auto-update session position from the last concept update so that
        // pause/resume picks up where the student actually is, even if the
        // agent didn't send an explicit position update.
        const lastConceptId = params.concept_updates[params.concept_updates.length - 1].concept_id
        try {
          const { data: concept } = await supabase
            .from('concepts')
            .select('section_id')
            .eq('id', lastConceptId)
            .single()

          if (concept) {
            const { data: section } = await supabase
              .from('sections')
              .select('chapter_id')
              .eq('id', concept.section_id)
              .single()

            if (section) {
              const { error: posErr } = await supabase
                .from('sessions')
                .update({
                  current_chapter_id: section.chapter_id,
                  current_section_id: concept.section_id,
                  current_concept_id: lastConceptId,
                })
                .eq('id', sessionId)
              if (posErr) console.warn('Auto position update rejected:', posErr.message)
              const titles = await fetchPositionTitles(section.chapter_id, concept.section_id)
              if (titles) emitPositionChanged(sessionId, titles.chapterTitle, titles.sectionTitle)
            }
          }
        } catch (err) {
          console.warn('Auto position update failed:', err)
        }
      }

      // Warnings are logged client-side for debugging but don't disrupt the
      // session flow — tool return is always a string the agent can read.
      if (warnings.length) {
        console.error('Session tool handler warnings:', warnings)
        emitSessionToolWarnings(sessionId, warnings)
      }

      // Return a fresh mastery snapshot so the agent re-grounds on what's
      // already been covered and stops re-teaching mastered concepts. On
      // no-op calls (or fetch failures) we fall back to 'ok'.
      if (hadWrites) {
        return await buildStateSnapshot(userId, materialId)
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
