import type { MessagePayload } from '@elevenlabs/types'

export type TranscriptMessage = {
  id: string
  role: 'user' | 'agent'
  text: string
  tentative: boolean
}



function splitWords(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return trimmed.split(/\s+/)
}

export function getNextStreamingTentativeText(currentText: string, targetText: string): string {
  const targetWords = splitWords(targetText)
  if (!targetWords.length) return ''

  const currentWords = splitWords(currentText)
  if (!currentWords.length) {
    return targetWords[0]
  }

  const currentAsPrefix = currentWords.join(' ')
  const targetAsText = targetWords.join(' ')

  // If model corrected itself, restart progressive rendering from the start.
  if (!targetAsText.startsWith(currentAsPrefix)) {
    return targetWords[0]
  }

  if (currentWords.length >= targetWords.length) {
    return targetAsText
  }

  return targetWords.slice(0, currentWords.length + 1).join(' ')
}

function mergeTentativeText(previousText: string, incomingText: string): string {
  if (!previousText) return incomingText

  const prev = previousText
  const incoming = incomingText

  // Many APIs stream tentative text as full "text so far" snapshots.
  if (incoming.startsWith(prev) || prev.startsWith(incoming)) {
    return incoming
  }

  // Some APIs stream as token/delta chunks. Append while preserving natural spacing.
  const needsSpace = !prev.endsWith(' ') && !incoming.startsWith(' ')
  return `${prev}${needsSpace ? ' ' : ''}${incoming}`
}

export function mergeTranscriptMessage(
  previous: TranscriptMessage[],
  payload: MessagePayload
): TranscriptMessage[] {
  const rawText = payload.message ?? ''
  if (!rawText.trim()) return previous
  const text = rawText

  const role = payload.role
  const isTentative = payload.event_id == null
  const next = [...previous]

  const findLastTentativeIdx = (targetRole: 'user' | 'agent') => {
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].role === targetRole && next[i].tentative) return i
    }
    return -1
  }

  if (isTentative) {
    const tentativeIdx = findLastTentativeIdx(role)
    if (tentativeIdx >= 0) {
      const mergedText = mergeTentativeText(next[tentativeIdx].text, text)
      next[tentativeIdx] = { ...next[tentativeIdx], text: mergedText }
    } else {
      next.push({ id: `tentative-${role}`, role, text, tentative: true })
    }
    return next
  }

  const finalId = `final-${payload.event_id}`
  const existingFinalIdx = next.findIndex((m) => m.id === finalId)
  if (existingFinalIdx >= 0) {
    next[existingFinalIdx] = { id: finalId, role, text, tentative: false }
    return next
  }

  const tentativeIdx = findLastTentativeIdx(role)
  if (tentativeIdx >= 0) {
    next[tentativeIdx] = { id: finalId, role, text, tentative: false }
  } else {
    next.push({ id: finalId, role, text, tentative: false })
  }

  return next
}


export function parseTentativeAgentDebugMessage(payload: unknown): MessagePayload | null {
  if (!payload || typeof payload !== 'object') return null

  const candidate = payload as { type?: unknown; response?: unknown }
  if (candidate.type !== 'tentative_agent_response') return null
  if (typeof candidate.response !== 'string') return null

  const message = candidate.response.trim()
  if (!message) return null

  return {
    source: 'ai',
    role: 'agent',
    message,
  }
}
