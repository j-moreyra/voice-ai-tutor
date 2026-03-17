# HANDOFF.md — Voice AI Tutor

## 1. Project Overview

**Voice AI Tutor** — a React 18 + TypeScript PWA for AI-powered voice tutoring. Students upload course materials (PDF/DOCX/PPTX), which are processed into structured content (chapters > sections > concepts), then studied via real-time voice sessions powered by ElevenLabs.

**Stack:** React 18 / Vite 6 / Tailwind CSS 4 / Supabase (Auth, DB, Edge Functions, Storage) / ElevenLabs voice / Netlify deploy

---

## 2. Directory Structure

```
src/
├── pages/                       Route-level components
│   ├── AuthCallback.tsx         Google OAuth hash-fragment handler
│   ├── Dashboard.tsx            Material list + file upload hub
│   ├── Onboarding.tsx           Post-signup profile setup
│   ├── SignIn.tsx               Email/password + Google sign-in
│   ├── SignUp.tsx               Registration + education level
│   ├── StudyPlan.tsx            Chapter accordion + mastery view + voice CTA
│   └── VoiceSession.tsx         Real-time ElevenLabs voice session
├── components/
│   ├── FileUpload.tsx           Drag-and-drop upload with stage indicators
│   ├── GoogleSignInButton.tsx   Shared Google OAuth button (used by SignIn + SignUp)
│   ├── MaterialCard.tsx         Material list item with status badge + stuck detection
│   ├── MaterialDetail.tsx       Material structure viewer
│   ├── MasteryBadge.tsx         Colored dot + label for mastery status
│   ├── ProgressBar.tsx          Single-color mastery bar (mastered / total)
│   ├── ProtectedRoute.tsx       Auth gate → redirect to /signin or /onboarding
│   ├── SessionStatus.tsx        Voice session visual states (connecting/listening/speaking/ended)
│   └── VoiceSessionErrorBoundary.tsx  Error boundary for voice session crashes
├── lib/
│   ├── supabase.ts              Supabase client singleton
│   ├── extract.ts               Client-side text extraction (PDF/DOCX/PPTX)
│   ├── materials.ts             Upload pipeline, fetch, delete, realtime subscription
│   ├── session.ts               Session lifecycle (type detection, create, end, signed URL)
│   ├── sessionTools.ts          ElevenLabs client tool handler (mastery, position, sections)
│   ├── study.ts                 Study plan fetch + stats + realtime subscription
│   └── __tests__/               Unit tests (5 files, 86 tests)
├── contexts/
│   └── AuthContext.tsx           Auth state provider (user, session, profile, loading)
├── types/
│   ├── database.ts              All DB interfaces + EDUCATION_LEVELS constant
│   └── __tests__/               Type tests (1 file, 6 tests)
├── App.tsx                      Router + HashRedirect + error boundary wrapping
└── main.tsx                     React entry point

supabase/functions/
├── get-signed-url/index.ts      Builds dynamic context → fetches ElevenLabs signed URL
└── process-material/index.ts    Claude Sonnet 4 → structures text into curriculum
```

---

## 3. Current Status

**Branch:** `claude/read-handoff-doc-RDhGh`

### Recent work (this branch)

| Area | Changes |
|------|---------|
| **Speed slider** | Commented out — ElevenLabs V3 TTS model does not support speed overrides. State, UI, and URL param all commented (not deleted) for future re-enabling |
| **Pause button** | Removed entirely. Multiple approaches were tried (disconnect/reconnect, contextual updates, setVolume, skip_turn) — all had issues with the AI losing context or restarting from the beginning. The pause button, all pause state/refs, and related UI indicators have been deleted |
| **Study plan UI** | Concept-level bullets hidden (commented out) — only section headers shown under each chapter. ProgressBar simplified to single accent color showing mastered/total only |
| **Session header** | VoiceSession now displays chapter and section names in the header. StudyPlan passes these as URL search params (`chapter`, `section`) |
| **End Session button** | Removed from footer — the Back button in the header already handles session teardown. Only the mute button remains in the footer |
| **Position tracking** | Edge function now returns two variables: `last_concept_completed` (truly mastered) and `current_concept_in_progress` (concept being taught). Falls back to mastery state when `current_concept_id` is null |
| **Disconnect resilience** | `determineSessionType` returns `previousPosition` from old sessions on disconnect. New sessions carry forward chapter/section/concept IDs |
| **Tab-switch handling** | 5-second grace period on disconnect before teardown. `visibilitychange` listener cancels pending teardown when tab becomes visible. useEffect cleanup skipped when `document.hidden` is true |
| **System prompt** | Added `paused` session type (now unused but harmless). Tightened `disconnected` and `returning` instructions to use `current_concept_in_progress`. All resume types explicitly told not to restart sections |

### Test coverage

**92 tests, 6 files, all passing** (`npm test`)

| File | Tests | Coverage |
|------|-------|----------|
| `session.test.ts` | 16 | `determineSessionType` (7 paths), `createSession`, `endSession`, `getSignedUrl` |
| `materials.test.ts` | 35 | `validateFile`, `getFileType`, `uploadMaterial` (7 scenarios), `fetchMaterials`, `fetchMaterialStructure`, `deleteMaterial`, `subscribeMaterials` |
| `sessionTools.test.ts` | 9 | All tool handler params, simultaneous ops, error recovery |
| `study.test.ts` | 12 | `fetchStudyPlan` (hierarchy, mastery mapping, stats), `subscribeStudyPlan` |
| `extract.test.ts` | 14 | `extractXmlText` (entities, whitespace, nesting), `extractText` dispatch |
| `database.test.ts` | 6 | `EDUCATION_LEVELS` constant validation |

---

## 4. Architecture & Data Flow

### Upload pipeline
```
User drops file → validateFile() → extractText() [client-side PDF/DOCX/PPTX]
  → upload to Supabase Storage → insert materials row → onMaterialCreated callback
  → fire-and-forget: process-material Edge Function
    → Claude Sonnet 4 structures text → inserts chapters/sections/concepts/questions
    → updates material status to 'completed'
  → Dashboard polls every 3s + realtime subscription for status updates
```

### Voice session lifecycle
```
VoiceSession mount → getUserMedia (mic) → determineSessionType()
  → createSession() → getSignedUrl() [Edge Function builds context]
  → ElevenLabs Conversation.startSession({ signedUrl, dynamicVariables, clientTools })
  → onConnect → status='connected', mode='listening'
  → onModeChange → toggles between 'listening' and 'speaking'
  → clientTools.update_session_state → upserts mastery, sections, chapter results, position
  → onDisconnect → 5s grace period before teardown (tab-switch resilient)
  → End (via Back button): handleEnd() → cleanup mic + ElevenLabs + persist end reason
```

### Session type determination (`determineSessionType`)
```
No previous sessions               → 'first_session'
Orphaned session < 15 min ago      → 'disconnected' (also auto-closes orphan + carries position)
Last ended as disconnected/timeout  → 'disconnected' (if < 15 min, carries position)
All concepts mastered (RPC check)  → 'returning_completed'
Otherwise                          → 'returning'
```

### Disconnect handling (VoiceSession.tsx)
```
onDisconnect fires → record timestamp → start 5s timer
  → If onConnect fires within 5s: cancel timer, continue normally
  → If tab becomes visible within 10s of disconnect: cancel timer, send activity ping
  → If 5s expires with no reconnection: tear down session (endSession, stopMediaStream, show error)
  → useEffect cleanup: skip if document.hidden (prevents tab suspension from tearing down)
```

---

## 5. Key Decisions

- **Client-side text extraction** — pdfjs-dist/mammoth/jszip in browser, not Edge Functions. Reduces server load.
- **Two-layer content grounding** — Layer 1 (strict curriculum adherence) + Layer 2 (flexible teaching knowledge). Defined in `Voice_AI_Tutor_System_Prompt_v1.0.md`.
- **Teach-check pattern** — AI teaches in 15–45s voice chunks, then checks understanding. Mastery tracked per concept.
- **No pause button** — Removed after multiple failed approaches. Tab-switch resilience and mute button provide sufficient control. If pause is revisited, the contextual update approach (`sendContextualUpdate` + `setVolume`) was the most promising but still had issues with the AI losing conversation context.
- **Two position variables** — `last_concept_completed` (mastered) vs `current_concept_in_progress` (being taught). Prevents the AI from skipping the current concept or restarting the section.
- **Dark theme** — `#0A0A0F` base, custom CSS properties for all colors.
- **PWA** — Workbox auto-update, offline-capable, installable.
- **Supabase RLS** — All tables row-level secured. Edge Functions use service role key.
- **Fire-and-forget processing** — `uploadMaterial` doesn't await `process-material`. Dashboard polls + realtime subscription picks up status changes.

---

## 6. Edge Functions

### `get-signed-url`
- **Auth:** JWT verification via `supabase.auth.getUser(token)`
- **Context building:** Parallel fetches for profile, session, material text, chapters, sections, concepts, mastery, professor questions
- **Position tracking:** Derives `last_concept_completed` and `current_concept_in_progress` from session's `current_concept_id` and mastery state. Falls back to walking the lesson plan when `current_concept_id` is null
- **Dynamic variables passed to ElevenLabs:** student name, education level, session type, days since last session, mastery summary, struggling/skipped concepts, last concept completed, current concept in progress, current chapter/section, lesson plan JSON, professor questions JSON, study material text (first 30K chars)
- **External call:** `GET https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=...` with `xi-api-key` header
- **Returns:** `{ signed_url, dynamic_variables }`

### `process-material`
- **Auth:** JWT verification + material ownership check
- **Processing:** Claude Sonnet 4 (`claude-sonnet-4-20250514`) with structured JSON prompt
- **Text limit:** 400K characters (truncated with notice)
- **Inserts:** Chapters → sections → concepts → professor questions (sequential, error-tolerant)
- **Status flow:** `pending` → `processing` → `completed` or `failed` (with error message)
- **Anthropic SDK:** `@anthropic-ai/sdk@0.39.0` via esm.sh

---

## 7. Database

**Project:** `rfnxdtyzadsubosekefm` (us-east-2). Full schema in `database-schema.md`.

| Table | Purpose |
|-------|---------|
| `profiles` | User name + education level |
| `materials` | Uploaded files + processing status + extracted text |
| `chapters` → `sections` → `concepts` | Curriculum hierarchy (linked by foreign keys) |
| `professor_questions` | Extracted questions with type and placement hints |
| `mastery_state` | Per-concept mastery (`not_started` / `in_progress` / `struggling` / `mastered` / `skipped`) |
| `chapter_results` | Chapter-level assessment (`mastered` / `not_mastered`) |
| `sessions` | Session lifecycle + current position (chapter/section/concept) |
| `session_sections_completed` | Sections completed within a session |

**RPC:** `check_material_completion(p_user_id, p_material_id)` — returns boolean

**Storage bucket:** `materials` (private, 50MB limit)

**Key relationships:**
- `materials` → `chapters` (via `material_id`)
- `chapters` → `sections` (via `chapter_id`)
- `sections` → `concepts` (via `section_id`)
- `mastery_state` keyed on `(concept_id, user_id)`
- `chapter_results` keyed on `(chapter_id, user_id)`

---

## 8. Known Issues & Next Steps

### Known issues
- **Tab-switch disconnects** — The 5-second grace period helps but may not cover all cases. Browsers aggressively throttle/suspend background tabs. The current approach is best-effort; ElevenLabs may still drop connections on longer tab switches
- **Speed slider disabled** — ElevenLabs V3 Conversational model does not support TTS speed overrides. Code is commented out, not deleted

### Next steps
- [ ] Verify `update_session_state` client tool integration end-to-end with ElevenLabs
- [ ] Validate mastery state transitions match system prompt spec
- [ ] Test material processing with edge-case file formats (large files, complex layouts)
- [ ] Add `@testing-library/react` + `jsdom` for component-level testing
- [ ] Consider adding `material_id` to `sections`/`concepts` or an RPC to avoid global fetches in `fetchStudyPlan` and `fetchMaterialStructure`
- [ ] Wire the `Database` type into `createClient<Database>()` for full type safety
- [ ] Consider re-adding pause functionality if ElevenLabs adds better support for mid-session context preservation

---

## 9. Environment & Config

**Required env vars** (see `.env.example`):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

**Edge Function env vars** (set in Supabase dashboard):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- `ANTHROPIC_API_KEY`

**Scripts:**
- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + Vite production build
- `npm test` — Vitest (92 tests)
- `npm run preview` — Preview production build

**Deploy:** Netlify (auto-build from git, SPA fallback configured in `netlify.toml`)

---

## 10. Reference Docs

| File | Purpose |
|------|---------|
| `database-schema.md` | Complete DB schema with columns, constraints, indexes, RLS |
| `Voice_AI_Tutor_System_Prompt_v1.0.md` | AI tutor behavior spec (teach-check pattern, calibration, assessments) |
| `.env.example` | Required environment variables |
| `Voice_AI_Tutor_PRD_v1.2.docx` | Product requirements (reference only) |
| `Voice_AI_Tutor_Conversation_Design.docx` | Conversation design flows (reference only) |
