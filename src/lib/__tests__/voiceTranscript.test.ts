// Transcription tests commented out — feature disabled for now.

import { describe, it } from 'vitest'

describe('voiceTranscript (disabled)', () => {
  it.skip('transcription feature is disabled', () => {})
})

// import { describe, it, expect } from 'vitest'
// import { mergeTranscriptMessage, type TranscriptMessage } from '../voiceTranscript'
//
// describe('mergeTranscriptMessage', () => {
//   it('adds new tentative message when no existing tentative for role', () => {
//     const result = mergeTranscriptMessage([], { role: 'agent', source: 'ai', message: 'Hello' })
//     expect(result).toEqual([{ id: 'tentative-agent', role: 'agent', text: 'Hello', tentative: true }])
//   })
//
//   it('replaces existing tentative message in place', () => {
//     const prev: TranscriptMessage[] = [{ id: 'tentative-user', role: 'user', text: 'hel', tentative: true }]
//     const result = mergeTranscriptMessage(prev, { role: 'user', source: 'user', message: 'hello' })
//     expect(result).toEqual([{ id: 'tentative-user', role: 'user', text: 'hello', tentative: true }])
//   })
//
//   it('upgrades tentative message to final when event_id arrives', () => {
//     const prev: TranscriptMessage[] = [{ id: 'tentative-agent', role: 'agent', text: 'working', tentative: true }]
//     const result = mergeTranscriptMessage(prev, { role: 'agent', source: 'ai', message: 'done', event_id: 10 })
//     expect(result).toEqual([{ id: 'final-10', role: 'agent', text: 'done', tentative: false }])
//   })
//
//   it('does not duplicate final messages with same event_id', () => {
//     const prev: TranscriptMessage[] = [{ id: 'final-5', role: 'agent', text: 'one', tentative: false }]
//     const result = mergeTranscriptMessage(prev, { role: 'agent', source: 'ai', message: 'one updated', event_id: 5 })
//     expect(result).toEqual([{ id: 'final-5', role: 'agent', text: 'one updated', tentative: false }])
//   })
// })
