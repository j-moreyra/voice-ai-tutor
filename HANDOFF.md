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
│   └── VoiceSession.tsx         Real-time ElevenLabs voice session (411 LOC)
├── components/
│   ├── FileUpload.tsx           Drag-and-drop upload with stage indicators
│   ├── GoogleSignInButton.tsx   Shared Google OAuth button (used by SignIn + SignUp)
│   ├── MaterialCard.tsx         Material list item with status badge + stuck detection
│   ├── MaterialDetail.tsx       Material structure viewer
│   ├── MasteryBadge.tsx         Colored dot + label for mastery status
│   ├── ProgressBar.tsx          Segmented mastery bar (mastered/in-progress/struggling)
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

**Branch:** `claude/review-handoff-Lrnw2` — clean working tree, all pushed

### Recent work (this branch)

| Commit | Description |
|--------|-------------|
| `72cedde` | Comprehensive unit tests: 92 tests across 6 files covering all lib modules |
| `8b013ab` | Refactor: Map for PPTX extraction, single-pass stats, shared components, dead code removal |
| `9b4331d` | Pause button "Pausing..." transitional state while agent finishes speaking |
| `b958581` | Extract `setMicEnabled` helper in VoiceSession |
| `4a6f1f7` | Pause/resume button with contextual updates to agent |
| `3acea83` | Voice speed slider (0.7x–1.2x) on StudyPlan page |

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
  → Pause: mutes mic + contextual update; "Pausing..." state if agent still speaking
  → End: endSession() → cleanup mic + ElevenLabs + persist end reason
```

### Session type determination (`determineSessionType`)
```
No previous sessions               → 'first_session'
Orphaned session < 15 min ago      → 'disconnected' (also auto-closes orphan)
Last ended as disconnected/timeout  → 'disconnected' (if < 15 min)
All concepts mastered (RPC check)  → 'returning_completed'
Otherwise                          → 'returning'
```

---

## 5. Key Decisions

- **Client-side text extraction** — pdfjs-dist/mammoth/jszip in browser, not Edge Functions. Reduces server load. Chunk load retry with sessionStorage dedup for PWA cache busting.
- **Two-layer content grounding** — Layer 1 (strict curriculum adherence) + Layer 2 (flexible teaching knowledge). Defined in `Voice_AI_Tutor_System_Prompt_v1.0.md`.
- **Teach-check pattern** — AI teaches in 15–45s voice chunks, then checks understanding. Mastery tracked per concept.
- **Pause state machine** — Three states: unpaused → pausing (while agent speaks) → paused. Uses `pausePendingRef` to avoid stale closures in `onModeChange`. Cancel-pause supported.
- **Dark theme** — `#0A0A0F` base, custom CSS properties for all colors.
- **PWA** — Workbox auto-update, offline-capable, installable.
- **Supabase RLS** — All tables row-level secured. Edge Functions use service role key.
- **Fire-and-forget processing** — `uploadMaterial` doesn't await `process-material`. Dashboard polls + realtime subscription picks up status changes. `.catch()` handler prevents unhandled rejections.

---

## 6. Edge Functions

### `get-signed-url`
- **Auth:** JWT verification via `supabase.auth.getUser(token)`
- **Context building:** Parallel fetches for profile, session, material text, chapters, sections, concepts, mastery, professor questions
- **Dynamic variables passed to ElevenLabs:** student name, education level, session type, days since last session, mastery summary, struggling/skipped concepts, lesson plan JSON, professor questions JSON, study material text (first 30K chars)
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

## 8. Pending / Next Steps

- [ ] Verify `update_session_state` client tool integration end-to-end with ElevenLabs
- [ ] Validate mastery state transitions match system prompt spec
- [ ] Test material processing with edge-case file formats (large files, complex layouts)
- [ ] Add `@testing-library/react` + `jsdom` for component-level testing
- [ ] Consider adding `material_id` to `sections`/`concepts` or an RPC to avoid global fetches in `fetchStudyPlan` and `fetchMaterialStructure`
- [ ] Wire the `Database` type into `createClient<Database>()` for full type safety

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
