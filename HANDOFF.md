# HANDOFF.md — Voice AI Tutor

## 1. Project Overview

**Voice AI Tutor** — a React 18 + TypeScript PWA for AI-powered voice tutoring. Students upload course materials (PDF/DOCX/PPTX), which are processed into structured content (chapters > sections > concepts), then studied via real-time voice sessions powered by ElevenLabs.

**Stack:** React 18 / Vite 6 / Tailwind CSS 4 / Supabase (Auth, DB, Edge Functions, Storage) / Anthropic Claude Sonnet 4 / ElevenLabs voice / Netlify (static hosting)

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
└── process-material-background.mts  DEAD CODE — retain for reference only. Not called by the app. See §5.
                                     Delete after confirming the current architecture is stable.

supabase/functions/
├── _shared/                     Shared CORS helpers for edge functions
├── get-signed-url/index.ts      Builds dynamic context → fetches ElevenLabs signed URL
└── process-material/index.ts    Per-chunk proxy: receives one chunk, makes one Anthropic call, returns result
```

---

## 3. Current Status

**Branch:** `claude/add-mac-notification-hook-cQF2I`

### Recent work (this branch)

The material processing architecture went through three iterations in this branch. The final (current) state is the per-chunk proxy + client orchestration in row 1.

| Area | Changes |
|------|---------|
| **Material processing → Supabase Edge Function as per-chunk proxy** | Edge function now handles ONE chunk per request — receives `{ material_id, chunk_text, chunk_index, total_chunks }`, makes one Anthropic call, returns the parsed plan. No more server-side timeouts. Client (`materials.ts`) orchestrates: splits text, calls edge function per chunk with retry/backoff on 429, merges results, writes to DB, initializes `mastery_state`, updates material status |
| **Anthropic rate limit handling** | `max_tokens: 5000` per request (safely under Tier 1's 8K output tokens/minute cap). 429 responses return `{ error: 'rate_limited', retry_after }`; client waits per `Retry-After` header with up to 5 retries |
| **JWT refresh during long uploads** | Session re-read via `supabase.auth.getSession()` before every chunk call. Supabase client auto-refreshes in background, so long-running uploads (many chunks + rate-limit waits) survive past the 1-hour JWT lifetime |
| **Closed `pending` status window** | `materials` row now inserted with `processing_status: 'processing'` directly. Eliminates the brief window where an abandoned tab could leave a row at `pending` forever (UI stuck-detection only observes `processing`) |
| **UI stuck threshold** | Raised from 3 to 5 minutes to accommodate rate-limit retry backoff on Tier 1 |
| **Security hardening** | Scoped DB queries in `fetchMaterialStructure`, sanitized error messages, rate limiting on Claude/ElevenLabs, `sourcemap: false` in Vite config, expanded `.gitignore` for `.env.*` |
| **Dependency updates** | `@anthropic-ai/sdk` → `^0.80.0`, `@elevenlabs/client` → `^0.16.0` |
| **Speed slider, Pause button, Study plan UI, Session header, Position tracking, Tab-switch handling** | Unchanged from prior branch — see git history before `ba82c7f` |

#### Dead end: Netlify background function (abandoned)

Commits `cf0a9f7`..`c882436` migrated processing to a Netlify background function (15-min timeout). This was then abandoned in `ba82c7f` because of a [known Netlify platform regression since March 27, 2026](https://answers.netlify.com/t/process-env-user-defined-variables-missing-in-scheduled-background-functions-and-async-workloads/160922) where user-defined `process.env` vars are missing in background/scheduled functions. The function would start, fail to read `ANTHROPIC_API_KEY`, and silently return — materials never left `pending`.

The file `netlify/functions/process-material-background.mts` remains in the repo but is not called by anything. Safe to delete once the current architecture is confirmed stable.

### Test coverage

**104 tests, 9 files, all passing** (`npm test`)

| File | Tests | Coverage |
|------|-------|----------|
| `session.test.ts` | 16 | `determineSessionType` (7 paths), `createSession`, `endSession`, `getSignedUrl` |
| `materials.test.ts` | 36 | `validateFile`, `getFileType`, `uploadMaterial` (incl. per-chunk edge function POST), `fetchMaterials`, `fetchMaterialStructure`, `deleteMaterial`, `subscribeMaterials` |
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
  → upload to Supabase Storage
  → insert materials row with processing_status='processing' (no 'pending' window)
  → onMaterialCreated callback (dashboard shows the card)
  → fire-and-forget: processChunkedMaterial() [client-side]
      → split text into 6K-char chunks (500-char overlap at paragraph boundaries)
      → for each chunk:
          → re-read session.access_token (Supabase auto-refreshes JWT)
          → POST to supabase/functions/v1/process-material
              Body: { material_id, chunk_text, chunk_index, total_chunks }
              Edge function: auth → Anthropic call → returns parsed plan JSON
          → on 429: wait per retry_after header, retry (up to 5×)
          → on other error: throw → caught by outer catch → status 'failed'
          → heartbeat: touch materials.updated_at to defeat UI stuck detection
      → merge chunk results (dedup chapters/sections/concepts by title)
      → write chapters → sections → concepts → professor_questions
      → initialize mastery_state rows (not_started for every concept)
      → update materials.processing_status to 'completed'
  → Dashboard polls every 3s + realtime subscription for status updates
```

**Trade-off:** this pipeline runs in the browser. If the user closes the tab mid-processing, the material stays in `processing` until the 5-minute stuck threshold, then the UI marks it stuck and prompts delete + re-upload. This is the tradeoff for not hitting any server-side timeout.

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
- **Client-orchestrated per-chunk processing** — Edge function makes exactly one Anthropic call per HTTP request; client splits, retries, merges, and writes. Avoids all server-side timeout limits. Chosen after Supabase Edge Functions (150s) timed out and Netlify background functions (15m) were broken by the env var regression.
- **`max_tokens: 5000` + 6K-char chunks** — Fits under Anthropic Tier 1's 8K output tokens/minute rate limit per request. Larger chunks truncated JSON responses; smaller `max_tokens` produced more chunks but each completed faster.
- **Fire-and-forget processing** — `uploadMaterial` returns immediately after kicking off `processChunkedMaterial`. Dashboard polls + realtime subscription picks up status changes.
- **Materials insert with `processing_status='processing'`** — Prevents abandoned-tab + default `pending` status leaving rows permanently stuck (the UI's stuck-detection only watches `processing`).
- **Re-read session per chunk** — Supabase JWTs expire in 1 hour; long uploads on rate-limited tiers can easily exceed that. The Supabase client auto-refreshes in the background, so `getSession()` always returns the current valid token.
- **API key server-side only** — Anthropic API key stored as Supabase edge function secret (not `VITE_`-prefixed so never in the browser bundle).
- **Sourcemaps disabled** — `build: { sourcemap: false }` in Vite config to prevent exposing source code in production.

---

## 6. Server Functions

### Supabase Edge Function: `process-material` (primary)
- **Purpose:** Per-chunk proxy. Receives ONE chunk of text, makes ONE Anthropic call, returns the parsed plan. All orchestration (splitting, merging, retries, DB writes) happens client-side.
- **Request body:** `{ material_id, chunk_text, chunk_index, total_chunks }`
- **Auth:** `Authorization: Bearer <jwt>`. Verifies token via `supabase.auth.getUser(token)`, then confirms material ownership by querying materials table with service role key.
- **Model:** `claude-sonnet-4-20250514` with `max_tokens: 5000` (Tier 1 rate-limit safe)
- **Response:**
  - `200` — `{ chapters: [...], professor_questions: [...] }`
  - `429` — `{ error: 'rate_limited', retry_after: <seconds> }` (Anthropic rate limit passed through; client retries)
  - `401` — invalid JWT
  - `404` — material not owned by this user
  - `500` — other Anthropic or parsing errors
- **Chunk context in prompt:** When `total_chunks > 1`, the prompt tells Claude "This is chunk N of M" and instructs it to use `sort_order` values starting at `chunk_index * 1000` so chunks can be merged coherently.
- **Env vars:** `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — set in the Supabase dashboard. No Netlify secrets are used.
- **Deploy:** `npx supabase functions deploy process-material --no-verify-jwt --project-ref rfnxdtyzadsubosekefm`

### Supabase Edge Function: `get-signed-url`
- **Auth:** JWT verification via `supabase.auth.getUser(token)`
- **Rate limiting:** 20 sessions/hour per user
- **Context building:** Parallel fetches for profile, session, material text, chapters, sections, concepts, mastery, professor questions
- **Position tracking:** Derives `last_concept_completed` and `current_concept_in_progress` from session's `current_concept_id` and mastery state
- **Dynamic variables passed to ElevenLabs:** student name, education level, session type, days since last session, mastery summary, struggling/skipped concepts, last concept completed, current concept in progress, current chapter/section, lesson plan JSON, professor questions JSON, study material text (first 30K chars)
- **External call:** `GET https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=...` with `xi-api-key` header
- **Returns:** `{ signed_url, dynamic_variables }`

### Client-side processing (`src/lib/materials.ts`)
Moved here from server because of timeout + env var platform issues. Key pieces:
- `splitTextIntoChunks(text)` — 6K-char chunks, 500-char overlap, break at `\n\n` within last 20% of window
- `processChunkViaProxy(...)` — fetch loop with up to 5 retries on 429 (waits per `retry_after`); re-reads session on every attempt so JWT refresh is picked up
- `mergePlans(plans)` — dedup by title across chapters/sections/concepts, renumber sort_order sequentially, dedup questions by text
- `writePlanToSupabase(plan, materialId, userId)` — sequential chapter → section → concept inserts, then bulk `mastery_state` insert, then professor_questions
- Heartbeat: after every successful chunk, touches `materials.updated_at` so the 5-min UI stuck detection doesn't false-positive

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
- **Browser-dependent processing** — If the user closes the tab during upload, processing stops. The material stays `processing` until the 5-min stuck threshold, then the UI prompts delete + re-upload. No background recovery.
- **Anthropic Tier 1 rate limit is the primary bottleneck** — 8K output tokens/minute. A 40K-char document (≈7 chunks) takes ~5 min on Tier 1 due to rate-limit backoff between chunks. Tier 2 (80K TPM, unlocked after $40 deposit + 7 days) would cut this to under a minute.
- **Tab-switch disconnects during voice sessions** — 5-second grace period helps but browsers aggressively throttle/suspend background tabs. Best-effort.
- **Speed slider disabled** — ElevenLabs V3 Conversational model does not support TTS speed overrides. Code is commented out, not deleted.
- **Supabase Edge Functions require manual deploy** — No `SUPABASE_ACCESS_TOKEN` in CI. Deploy manually: `npx supabase functions deploy <name> --no-verify-jwt --project-ref rfnxdtyzadsubosekefm`
- **Dead Netlify background function file** — `netlify/functions/process-material-background.mts` is still in the repo but not called. Retained temporarily in case the current architecture needs rollback.

### Next steps
- [ ] Delete `netlify/functions/process-material-background.mts` once the per-chunk architecture is confirmed stable
- [ ] Add a progress indicator to the UI showing `Chunk X of Y` during processing (data is already in console logs)
- [ ] Consider a recovery flow: if a material is `processing` and > 5 min old, allow the user to resume (re-trigger processing from current text) instead of only delete
- [ ] Verify `update_session_state` client tool integration end-to-end with ElevenLabs
- [ ] Validate mastery state transitions match system prompt spec
- [ ] Test material processing with edge-case file formats (large files, complex layouts)
- [ ] Add `@testing-library/react` + `jsdom` for component-level testing
- [ ] Consider adding `material_id` to `sections`/`concepts` or an RPC to avoid global fetches in `fetchStudyPlan` and `fetchMaterialStructure`
- [ ] Wire the `Database` type into `createClient<Database>()` for full type safety
- [ ] Consider re-adding pause functionality if ElevenLabs adds better support for mid-session context preservation

---

## 9. Environment & Config

**Client env vars** (see `.env.example`, `VITE_` prefix = bundled into JS):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

**Supabase Edge Function env vars** (set in Supabase dashboard → Edge Functions → Secrets):
- `ANTHROPIC_API_KEY` — required by `process-material`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` — required by `get-signed-url`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — provided by Supabase automatically

**Netlify env vars:** none required. Netlify hosts the static frontend only.

**Anthropic account requirements:**
- Must have a positive credit balance (API calls fail with 429-like errors if balance hits $0)
- Tier 1 (default for new accounts) is workable but slow. Tier 2 requires $40 deposited + 7 days from first payment.

**Scripts:**
- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + Vite production build
- `npm test` — Vitest (104 tests)
- `npm run preview` — Preview production build

**Deploy:**
- **Frontend** — Netlify auto-builds from git push, SPA fallback configured in `netlify.toml`
- **Edge Functions** — manual: `npx supabase functions deploy <name> --no-verify-jwt --project-ref rfnxdtyzadsubosekefm`

---

## 10. Reference Docs

| File | Purpose |
|------|---------|
| `database-schema.md` | Complete DB schema with columns, constraints, indexes, RLS |
| `Voice_AI_Tutor_System_Prompt_v1.0.md` | AI tutor behavior spec (teach-check pattern, calibration, assessments) |
| `.env.example` | Required environment variables |
| `Voice_AI_Tutor_PRD_v1.2.docx` | Product requirements (reference only) |
| `Voice_AI_Tutor_Conversation_Design.docx` | Conversation design flows (reference only) |
