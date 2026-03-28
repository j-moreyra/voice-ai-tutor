# HANDOFF.md — Voice AI Tutor

## 1. Project Overview

**Voice AI Tutor** — a React 18 + TypeScript PWA for AI-powered voice tutoring. Students upload course materials (PDF/DOCX/PPTX), which are processed into structured content (chapters > sections > concepts), then studied via real-time voice sessions powered by ElevenLabs.

**Stack:** React 18 / Vite 6 / Tailwind CSS 4 / Supabase (Auth, DB, Edge Functions, Storage) / ElevenLabs voice / Netlify (deploy + background functions)

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

netlify/functions/
├── process-material-background.mts  Netlify background function (15-min timeout) — chunks text, calls Claude, writes curriculum to DB
└── process-chunk.ts                 Thin Netlify serverless proxy for per-chunk Anthropic calls (legacy, superseded by background function)

supabase/functions/
├── get-signed-url/index.ts      Builds dynamic context → fetches ElevenLabs signed URL
└── process-material/index.ts    Claude Sonnet 4 → structures text into curriculum (legacy, superseded by background function)
```

---

## 3. Current Status

**Branch:** `claude/add-mac-notification-hook-cQF2I`

### Recent work (this branch)

| Area | Changes |
|------|---------|
| **Material processing → Netlify Background Function** | Migrated from Supabase Edge Function to `netlify/functions/process-material-background.mts`. Background functions get 15-minute timeout (vs 10s regular / 150s edge). Client fires-and-forgets a POST with `{ material_id, text_content, user_id, auth_token }` |
| **Chunked processing** | Text split into 8K-char chunks with 500-char overlap at paragraph boundaries. Each chunk sent to Claude `claude-sonnet-4-20250514` with `max_tokens: 16000`. Results merged: chapters/sections/concepts deduplicated by title, sort_order renumbered |
| **Server-side auth** | Background function validates auth token via `supabase.auth.getUser(token)`, confirms `user.id` matches `user_id`, confirms material ownership by querying materials table with service role key. Returns 401/403 on failure |
| **mastery_state initialization** | Background function creates `not_started` mastery rows for every concept after writing curriculum to DB |
| **Debug logging** | Extensive `[bg-process]` prefixed `console.log` at every step of background function for diagnosing silent failures |
| **Security hardening** | Scoped DB queries in `fetchMaterialStructure`, sanitized error messages in edge functions, rate limiting on Claude/ElevenLabs API calls, `sourcemap: false` in Vite config, expanded `.gitignore` for `.env.*` |
| **CORS fixes** | Added `https://voice-ai-tutor.netlify.app` to allowed origins in both edge functions and the Netlify process-chunk function |
| **Netlify serverless proxy** | `process-chunk.ts` — thin proxy for per-chunk Anthropic calls (keeps API key server-side). Superseded by background function but still available |
| **Dependency updates** | `@anthropic-ai/sdk` → `^0.80.0`, `@elevenlabs/client` → `^0.16.0`, `@netlify/functions` → `^5.1.5` added |
| **Speed slider** | Commented out — ElevenLabs V3 TTS model does not support speed overrides |
| **Pause button** | Removed entirely after multiple failed approaches |
| **Study plan UI** | Concept-level bullets hidden; ProgressBar simplified to single accent color |
| **Session header** | Displays chapter/section names. StudyPlan passes as URL search params |
| **Position tracking** | `last_concept_completed` vs `current_concept_in_progress` — two-variable system |
| **Tab-switch handling** | 5-second grace period on disconnect before teardown |

### Test coverage

**104 tests, 9 files, all passing** (`npm test`)

| File | Tests | Coverage |
|------|-------|----------|
| `session.test.ts` | 16 | `determineSessionType` (7 paths), `createSession`, `endSession`, `getSignedUrl` |
| `materials.test.ts` | 36 | `validateFile`, `getFileType`, `uploadMaterial` (incl. background function POST), `fetchMaterials`, `fetchMaterialStructure`, `deleteMaterial`, `subscribeMaterials` |
| `sessionTools.test.ts` | 9 | All tool handler params, simultaneous ops, error recovery |
| `study.test.ts` | 12 | `fetchStudyPlan` (hierarchy, mastery mapping, stats), `subscribeStudyPlan` |
| `extract.test.ts` | 14 | `extractXmlText` (entities, whitespace, nesting), `extractText` dispatch |
| `database.test.ts` | 6 | `EDUCATION_LEVELS` constant validation |
| `edgeCors.test.ts` | 3 | CORS origin parsing, validation, header building |
| `authFlow.test.ts` | 3 | Auth callback timeout, session bootstrapping, session detection |
| `materialInteractions.test.ts` | 2 | Delete permission logic, upload error display |
| `voiceTranscript.test.ts` | 1 (skipped) | Transcription feature disabled |

---

## 4. Architecture & Data Flow

### Upload pipeline
```
User drops file → validateFile() → extractText() [client-side PDF/DOCX/PPTX]
  → upload to Supabase Storage → insert materials row → onMaterialCreated callback
  → set processing_status = 'processing'
  → fire-and-forget POST to /.netlify/functions/process-material-background
      Body: { material_id, text_content, user_id, auth_token }
      Returns 202 immediately
  → Background function (15-min timeout):
      → Verify auth token + user ownership
      → Split text into 8K-char chunks (500-char overlap at paragraph boundaries)
      → Call Claude Sonnet 4 per chunk (max_tokens: 16000)
      → Merge chunk results (dedup chapters/sections/concepts by title)
      → Write chapters → sections → concepts → professor_questions to DB
      → Initialize mastery_state rows (not_started for every concept)
      → Update material status to 'completed' or 'failed'
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
- **Fire-and-forget processing** — `uploadMaterial` doesn't await processing. POSTs to Netlify background function, gets 202, dashboard polls + realtime subscription picks up status changes.
- **Netlify background function over Supabase Edge Function** — Edge Functions have a 150s timeout that was too short for large documents. Netlify background functions get 15 minutes. The migration also solved CORS issues since the function runs on the same origin.
- **Chunked processing** — Large documents are split into 8K-char chunks with 500-char overlap to stay within Claude's output token limits. Chunk results are merged by deduplicating chapters/sections/concepts by title.
- **API key server-side only** — Anthropic API key stored as Netlify env var (no `VITE_` prefix). `VITE_` vars are embedded in the JS bundle and would be exposed to users. The background function and process-chunk proxy keep the key server-side.
- **Sourcemaps disabled** — `build: { sourcemap: false }` in Vite config to prevent exposing source code in production.

---

## 6. Server Functions

### Netlify Background Function: `process-material-background.mts`
- **Type:** Netlify background function (15-minute timeout). Filename must end in `-background`
- **Auth:** Three-step — (1) `supabase.auth.getUser(token)` to verify JWT, (2) confirm `user.id === user_id`, (3) query materials table to confirm ownership
- **Processing:** Claude Sonnet 4 (`claude-sonnet-4-20250514`) with `max_tokens: 16000`
- **Chunking:** `CHUNK_SIZE = 8000`, `OVERLAP_SIZE = 500`, split at paragraph boundaries. Each chunk includes context about its position (`chunk N of M`) and uses offset sort_order values
- **Merging:** Chunks merged by deduplicating chapters/sections/concepts by title, then renumbering sort_order sequentially
- **Text limit:** 400K characters (`MAX_TOTAL_CHARS`)
- **Inserts:** Chapters → sections → concepts → professor questions (sequential). Initializes `mastery_state` rows with `not_started` for every concept
- **Status flow:** `pending` → `processing` (set by client before POST) → `completed` or `failed` (with `processing_error` message)
- **Logging:** `[bg-process]` prefixed console.log at every step for debugging in Netlify logs
- **Env vars:** `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (set in Netlify dashboard, no `VITE_` prefix)

### Netlify Function: `process-chunk.ts`
- **Status:** Legacy — superseded by background function but still deployed
- **Purpose:** Thin serverless proxy for per-chunk Anthropic API calls (keeps API key server-side)
- **CORS:** Whitelists localhost + `voice-ai-tutor.netlify.app`

### Supabase Edge Function: `get-signed-url`
- **Auth:** JWT verification via `supabase.auth.getUser(token)`
- **Rate limiting:** 20 sessions/hour per user
- **Context building:** Parallel fetches for profile, session, material text, chapters, sections, concepts, mastery, professor questions
- **Position tracking:** Derives `last_concept_completed` and `current_concept_in_progress` from session's `current_concept_id` and mastery state
- **Dynamic variables passed to ElevenLabs:** student name, education level, session type, days since last session, mastery summary, struggling/skipped concepts, last concept completed, current concept in progress, current chapter/section, lesson plan JSON, professor questions JSON, study material text (first 30K chars)
- **External call:** `GET https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=...` with `xi-api-key` header
- **Returns:** `{ signed_url, dynamic_variables }`

### Supabase Edge Function: `process-material` (legacy)
- **Status:** Superseded by Netlify background function. Kept as fallback
- **Has:** EdgeRuntime.waitUntil(), chunked processing, rate limiting (10/hr), sanitized errors

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
- **Supabase Edge Functions require manual deploy** — No `SUPABASE_ACCESS_TOKEN` in CI. Deploy manually via `npx supabase functions deploy <name> --no-verify-jwt --project-ref rfnxdtyzadsubosekefm`
- **Legacy process-material Edge Function** — Still deployed but no longer the primary processing path. The Netlify background function has replaced it. Can be removed once background function is confirmed stable

### Next steps
- [ ] Verify `update_session_state` client tool integration end-to-end with ElevenLabs
- [ ] Validate mastery state transitions match system prompt spec
- [ ] Test material processing with edge-case file formats (large files, complex layouts)
- [ ] Remove legacy `supabase/functions/process-material/` and `netlify/functions/process-chunk.ts` once background function is confirmed stable
- [ ] Add `@testing-library/react` + `jsdom` for component-level testing
- [ ] Consider adding `material_id` to `sections`/`concepts` or an RPC to avoid global fetches in `fetchStudyPlan` and `fetchMaterialStructure`
- [ ] Wire the `Database` type into `createClient<Database>()` for full type safety
- [ ] Consider re-adding pause functionality if ElevenLabs adds better support for mid-session context preservation

---

## 9. Environment & Config

**Client env vars** (see `.env.example`, `VITE_` prefix = bundled into JS):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

**Netlify Function env vars** (set in Netlify dashboard, NOT `VITE_` prefixed):
- `ANTHROPIC_API_KEY` — for background function + process-chunk proxy
- `SUPABASE_URL` — Supabase project URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS for server-side DB writes

**Supabase Edge Function env vars** (set in Supabase dashboard):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- `ANTHROPIC_API_KEY`

**Scripts:**
- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + Vite production build
- `npm test` — Vitest (104 tests)
- `npm run preview` — Preview production build

**Deploy:** Netlify (auto-build from git, SPA fallback configured in `netlify.toml`). Supabase Edge Functions deployed separately via `npx supabase functions deploy --no-verify-jwt --project-ref rfnxdtyzadsubosekefm`

---

## 10. Reference Docs

| File | Purpose |
|------|---------|
| `database-schema.md` | Complete DB schema with columns, constraints, indexes, RLS |
| `Voice_AI_Tutor_System_Prompt_v1.0.md` | AI tutor behavior spec (teach-check pattern, calibration, assessments) |
| `.env.example` | Required environment variables |
| `Voice_AI_Tutor_PRD_v1.2.docx` | Product requirements (reference only) |
| `Voice_AI_Tutor_Conversation_Design.docx` | Conversation design flows (reference only) |
