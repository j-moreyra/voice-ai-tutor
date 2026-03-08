import { supabase } from './supabase'
import type { Session, SessionType, EndReason } from '../types/database'

const DISCONNECT_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

export async function determineSessionType(
  userId: string,
  materialId: string
): Promise<SessionType> {
  // Get most recent session
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .order('started_at', { ascending: false })
    .limit(1)

  if (!sessions?.length) return 'first_session'

  const last = sessions[0] as Session
  const now = Date.now()

  // Handle orphaned sessions (app crash / browser closed without ending)
  if (!last.ended_at) {
    const startedAt = new Date(last.started_at).getTime()
    const elapsed = now - startedAt

    // Close the orphaned session in the background
    endSession(last.id, 'disconnected').catch((err) =>
      console.error('Failed to close orphaned session:', err)
    )

    if (elapsed < DISCONNECT_THRESHOLD_MS) {
      return 'disconnected'
    }
  }

  // Handle explicit disconnects — only treat as "disconnected" if recent
  if (last.end_reason === 'disconnected' || last.end_reason === 'timeout') {
    if (last.ended_at) {
      const endedAt = new Date(last.ended_at).getTime()
      if (now - endedAt < DISCONNECT_THRESHOLD_MS) {
        return 'disconnected'
      }
    }
  }

  // Check if all concepts are mastered (single RPC call to Supabase)
  const { data: isComplete } = await supabase.rpc('check_material_completion', {
    p_user_id: userId,
    p_material_id: materialId,
  })

  if (isComplete) return 'returning_completed'

  return 'returning'
}

export async function createSession(
  userId: string,
  materialId: string,
  sessionType: SessionType,
  chapterId?: string
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      material_id: materialId,
      session_type: sessionType,
      ...(chapterId ? { current_chapter_id: chapterId } : {}),
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

export interface SignedUrlResult {
  signedUrl: string
  dynamicVariables: Record<string, string>
}

export async function getSignedUrl(
  materialId: string,
  sessionId: string
): Promise<SignedUrlResult> {
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
  return {
    signedUrl: data.signed_url,
    dynamicVariables: data.dynamic_variables,
  }
}
