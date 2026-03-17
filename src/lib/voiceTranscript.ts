// Transcription feature commented out for now — may be re-enabled in the future.

// import type { MessagePayload } from '@elevenlabs/types'
//
// export type TranscriptMessage = {
//   id: string
//   role: 'user' | 'agent'
//   text: string
//   tentative: boolean
// }
//
// export function mergeTranscriptMessage(
//   previous: TranscriptMessage[],
//   payload: MessagePayload
// ): TranscriptMessage[] {
//   const text = payload.message?.trim()
//   if (!text) return previous
//
//   const role = payload.role
//   const isTentative = payload.event_id == null
//   const next = [...previous]
//
//   const findLastTentativeIdx = (targetRole: 'user' | 'agent') => {
//     for (let i = next.length - 1; i >= 0; i--) {
//       if (next[i].role === targetRole && next[i].tentative) return i
//     }
//     return -1
//   }
//
//   if (isTentative) {
//     const tentativeIdx = findLastTentativeIdx(role)
//     if (tentativeIdx >= 0) {
//       next[tentativeIdx] = { ...next[tentativeIdx], text }
//     } else {
//       next.push({ id: `tentative-${role}`, role, text, tentative: true })
//     }
//     return next
//   }
//
//   const finalId = `final-${payload.event_id}`
//   const existingFinalIdx = next.findIndex((m) => m.id === finalId)
//   if (existingFinalIdx >= 0) {
//     next[existingFinalIdx] = { id: finalId, role, text, tentative: false }
//     return next
//   }
//
//   const tentativeIdx = findLastTentativeIdx(role)
//   if (tentativeIdx >= 0) {
//     next[tentativeIdx] = { id: finalId, role, text, tentative: false }
//   } else {
//     next.push({ id: finalId, role, text, tentative: false })
//   }
//
//   return next
// }
