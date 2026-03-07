import { supabase } from './supabase'
import type { Session, SessionType, EndReason, MasteryStatus } from '../types/database'

export async function determineSessionType(
  userId: string,
  materialId: string
): Promise<SessionType> {
  // Check for previous sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .order('started_at', { ascending: false })
    .limit(1)

  if (!sessions?.length) return 'first_session'

  const last = sessions[0] as Session

  // If last session ended due to disconnect/timeout, this is a reconnect
  if (last.end_reason === 'disconnected' || last.end_reason === 'timeout') {
    return 'disconnected'
  }

  // Check if all concepts are mastered
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id')
    .eq('material_id', materialId)

  if (chapters?.length) {
    const chapterIds = chapters.map((c) => c.id)

    const { data: sections } = await supabase
      .from('sections')
      .select('id')
      .in('chapter_id', chapterIds)

    if (sections?.length) {
      const sectionIds = sections.map((s) => s.id)

      const { data: concepts } = await supabase
        .from('concepts')
        .select('id')
        .in('section_id', sectionIds)

      if (concepts?.length) {
        const conceptIds = concepts.map((c) => c.id)

        const { data: mastery } = await supabase
          .from('mastery_state')
          .select('status')
          .eq('user_id', userId)
          .in('concept_id', conceptIds)

        const masteredCount = (mastery ?? []).filter(
          (m) => (m as { status: MasteryStatus }).status === 'mastered'
        ).length

        if (masteredCount === concepts.length) {
          return 'returning_completed'
        }
      }
    }
  }

  return 'returning'
}

export async function createSession(
  userId: string,
  materialId: string,
  sessionType: SessionType
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      material_id: materialId,
      session_type: sessionType,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create session: ${error.message}`)
  return data as Session
}

export async function endSession(
  sessionId: string,
  endReason: EndReason
): Promise<void> {
  await supabase
    .from('sessions')
    .update({
      ended_at: new Date().toISOString(),
      end_reason: endReason,
    })
    .eq('id', sessionId)
}

export async function getSignedUrl(
  materialId: string,
  sessionId: string
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('get-signed-url', {
    body: { material_id: materialId, session_id: sessionId },
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
    },
  })

  if (error) throw new Error(`Failed to get signed URL: ${error.message}`)
  return data.signed_url
}
