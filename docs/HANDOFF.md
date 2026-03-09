# HANDOFF.md — Voice AI Tutor

## 1. Project Overview

**Voice AI Tutor** — a React 18 + TypeScript PWA for AI-powered voice tutoring. Students upload course materials (PDF/DOCX/PPTX), which are processed into structured content (chapters > sections > concepts), then studied via real-time voice sessions powered by ElevenLabs Conversational AI + Claude Sonnet 4.5.

**Stack:** React 18 / Vite 6 / Tailwind CSS 4 / Supabase (Auth, DB, Edge Functions, Storage) / ElevenLabs ConvAI / Netlify deploy

**Key directories:**
- `src/pages/` — Route pages: Dashboard, SignIn, SignUp, StudyPlan, VoiceSession
- `src/components/` — FileUpload, MaterialCard, MaterialDetail, MasteryBadge, ProgressBar, ErrorBoundary, etc.
- `src/lib/` — Core logic: supabase.ts, materials.ts, extract.ts, session.ts, sessionTools.ts, study.ts
- `src/contexts/AuthContext.tsx` — Auth state provider
- `src/types/database.ts` — All DB table TypeScript interfaces
- `supabase/functions/` — Edge Functions: `process-material`, `get-signed-url`

**Reference docs:**
- `database-schema.md` — Full DB schema with all tables, indexes, RLS, triggers
- `Voice_AI_Tutor_System_Prompt_v1.0.md` — AI tutor behavior spec (v1.2 deployed to ElevenLabs)
- `Handoff-script.md` — Template/instructions for generating this file

## 2. Current Status

**Branch:** `claude/general-session-d5L9Z`
**Deployment:** https://voice-ai-tutor.netlify.app (auto-deploys from main)
**Deploy Preview:** https://deploy-preview-26--voice-ai-tutor.netlify.app

**Work completed THIS SESSION (March 9, 2026):**
- Updated HANDOFF.md with current branch status and deploy blocker
- Resolved merge conflict on HANDOFF.md (main had deleted it, branch had modified it)
- Attempted to deploy `get-signed-url` Edge Function — **blocked**: Supabase CLI requires interactive login (`npx supabase login`)
- Created this comprehensive `docs/HANDOFF.md` using the Handoff-script.md template

**Blockers:**
- ~~Supabase CLI authentication~~ — **Resolved.** CLI authenticated and `get-signed-url` deployed.

## 3. Architecture

### Supabase Backend
- **Project ID:** `rfnxdtyzadsubosekefm`
- **URL:** https://rfnxdtyzadsubosekefm.supabase.co
- **Region:** us-east-2
- **Storage bucket:** `materials` (private, 50MB per file, path: `{user_id}/{filename}`)
- **RPC Functions:** `check_material_completion(p_user_id, p_material_id)` — checks if all concepts mastered
- **Triggers:**
  - `validate_mastery_transition` on `mastery_state` — enforces valid state transitions
  - `set_mastery_state_updated_at` on `mastery_state` — auto-updates timestamp
- **RLS:** Enabled on all tables. Users can only read/write rows where `user_id = auth.uid()`. Edge Functions use `service_role` key to bypass RLS.

**Database tables (10):**

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (first_name, education_level), extends auth.users |
| `materials` | Uploaded files with extracted_text, processing_status |
| `chapters` | Top-level content units from material processing |
| `sections` | Units within chapters |
| `concepts` | Individual teachable units with key_facts |
| `professor_questions` | Assessment questions detected in materials |
| `mastery_state` | Per-concept, per-user mastery tracking (UNIQUE on concept_id + user_id) |
| `chapter_results` | Chapter assessment outcomes (mastered/not_mastered) |
| `sessions` | Session history with position tracking (current_chapter/section/concept) |
| `session_sections_completed` | Sections that passed quiz within a session |

**Key indexes:** `mastery_state(user_id, concept_id)`, `mastery_state(user_id, status)`, `sessions(user_id)`, `materials(user_id)`, `chapters(material_id)`, `sections(chapter_id)`, `concepts(section_id)`, `professor_questions(chapter_id)`

### Edge Functions

**1. `process-material`** (`supabase/functions/process-material/index.ts`)
- Receives extracted text from frontend, sends to Claude for structuring into chapters > sections > concepts
- Inserts structured content into DB (chapters, sections, concepts, professor_questions)
- Updates material processing_status to "completed" or "failed"
- Uses: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Imports: `https://esm.sh/@supabase/supabase-js@2`, `https://esm.sh/@anthropic-ai/sdk@0.39.0`

**2. `get-signed-url`** (`supabase/functions/get-signed-url/index.ts`)
- Fetches complete session context from DB (profile, session, material, chapters, sections, concepts, mastery, questions)
- Computes 15+ dynamic variables for ElevenLabs (student_name, mastery_summary, lesson_plan, study_material, etc.)
- Requests signed URL from ElevenLabs ConvAI API
- Returns `{ signedUrl, dynamicVariables }` to frontend
- Uses: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `study_material` dynamic variable truncated at 30,000 chars

**3. `update-session-state`** (webhook from ElevenLabs)
- Called by ElevenLabs agent during voice sessions for real-time mastery tracking
- Note: `sessionTools.ts` runs on the FRONTEND with anon key + user JWT — this is a client-side tool handler registered with ElevenLabs SDK, NOT a webhook. RLS INSERT policies are critical for this to work.

**Edge Function import pattern:** Use `jsr:@supabase/supabase-js@2` for new functions — `esm.sh` imports can cause 503 boot failures in Deno. Existing functions use `esm.sh` and work, but new functions should prefer `jsr:`.

**All Edge Functions use `verify_jwt: false`** — auth handled internally in function code.

### ElevenLabs Conversational AI
- **Agent ID:** `agent_9001kk4wcrxmfr6rwppw6apfzqcx`
- **Voice:** Dan — Warm, Conversational and Polite
- **LLM:** Claude Sonnet 4.5
- **TTS:** Flash (fastest)
- **System prompt:** v1.2 (teach-first, AI speaks first, informal tone)
- **First message:** Short greeting with `{{student_name}}` for immediate audio on connect
- **Tools configured:** `update_session_state` — called by agent for mastery state changes, position updates
- **Dynamic variables:** `student_name`, `education_level`, `session_type`, `days_since_last_session`, `mastery_summary`, `concepts_struggling`, `concepts_skipped`, `last_concept_completed`, `current_chapter`, `current_section`, `lesson_plan`, `professor_questions`, `study_material`, `user_id`, `session_id`

### Environment Variables

**Netlify (client-side, VITE_ prefix):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ELEVENLABS_AGENT_ID`
- `VITE_ELEVENLABS_API_KEY`

**Supabase Edge Function Secrets:**
- `ANTHROPIC_API_KEY` — Claude API (process-material)
- `ELEVENLABS_API_KEY` — ElevenLabs API (get-signed-url)
- `ELEVENLABS_AGENT_ID` — Agent ID (get-signed-url)
- `SUPABASE_URL` — Auto-provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Auto-provided by Supabase
- `SUPABASE_ANON_KEY` — Auto-provided (not currently used)

## 4. Key Decisions

- **Client-side text extraction** over server-side — reduces Edge Function load; uses pdfjs-dist (PDF), mammoth (DOCX), jszip (PPTX). Password-protected and scanned PDF detection added.
- **Two-layer content grounding** in AI tutor: Layer 1 (strict material adherence for teaching order/terminology) + Layer 2 (flexible broader knowledge for explanations)
- **Dark theme design system** — theme color `#0A0A0F`, applied globally across all components
- **PWA with Workbox auto-update** — handles stale cache with chunk load retry and auto-reload
- **Supabase RLS on all tables** — security enforced at DB level; Edge Functions bypass with service_role
- **Teach-Check pattern** — 15-45 second voice teaching chunks with comprehension question, then mastery tracking per concept
- **`verify_jwt: false` on all Edge Functions** — auth handled internally in function code, not at the gateway level
- **Study material via dynamic variable** (truncated at 30k chars) — NOT using ElevenLabs RAG knowledge base
- **`sessionTools.ts` runs on FRONTEND** with anon key + user JWT — not a server-side webhook. RLS INSERT policies are critical.
- **Edge Function imports:** `esm.sh` works for existing functions but `jsr:@supabase/supabase-js@2` preferred for new ones to avoid 503 boot failures
- **Client-side materials insert** with RLS — reverted from Edge Function delegation after testing (commits `e642aab` → `9ea6759`)
- **Orphaned session detection** — 15-minute threshold (`DISCONNECT_THRESHOLD_MS`); sessions without `ended_at` older than threshold are auto-ended as "disconnected"
- **`days_since_last_session`** uses `ended_at` when available, falls back to `started_at`

## 5. Prior Work History

### March 6, 2026 — Initial Build
- Initial commit with project spec docs uploaded
- **Phase 1A:** Scaffold React + TypeScript + Vite project with Supabase auth (sign up, sign in, dashboard)
- Set Node 20 in netlify.toml for Tailwind v4 / Vite 6 compatibility
- Education level label UX: changed to "What grade are you in?" with tooltip

### March 6-7, 2026 — Core Feature Build
- **Phase 1B:** Material upload flow with drag-and-drop, processing status, lesson plan viewer
- Fix RLS violation: tried delegating materials row creation to Edge Function, then reverted to client-side insert with RLS INSERT policy
- Added prefixed error messages to distinguish storage vs DB failures
- Fix: pass auth token explicitly to process-material Edge Function
- Fix: use snake_case `material_id` in Edge Function body
- Fix: prepend timestamp to storage filename to avoid collisions

### March 7, 2026 — Study & Voice Sessions
- **Phase 1C:** Study plan view with mastery tracking
- **Phase 1D:** Voice session with ElevenLabs Conversational AI integration
- Fix: pass dynamic variables client-side to `Conversation.startSession`
- Context-aware "Start Studying" button with chapter targeting
- Client-side file text extraction (pdfjs-dist, mammoth, jszip) — moved from server-side
- Field rename: `extracted_text` → `text_content` to match Edge Function contract
- Await Edge Function response and handle stuck processing state
- Chunk load retry with auto-reload for stale PWA cache
- Material status polling while processing is in progress
- Material card immediate display after DB row creation
- Complete UI/UX dark theme overhaul
- Stop mic recording when navigating away from voice session
- ElevenLabs env vars and missing dynamic variables integration

### March 8, 2026 — Hardening & Testing
- Added HANDOFF.md and Handoff-script.md
- Error boundaries and hardening added to voice session components
- Session resumption logic improved with orphan detection and 15-min time threshold
- PPTX extraction: speaker notes extraction and HTML entity decoding
- File extraction improvements: password detection, scanned PDF check, chart/diagram text handling
- Unit tests added for `extractXmlText` and `validateFile`
- Fixes: orphaned sessions cleanup, cosmetic mute bug, missing study material in dynamic variables
- Fix: `days_since_last_session` to use `ended_at` when available (not just `started_at`)

### System Prompt Progression
- **v1.0:** Initial system prompt with full behavioral spec (teach-check pattern, mastery tracking, session types)
- **v1.2 (deployed to ElevenLabs):** Teach-first approach, AI speaks first, informal tone, short first greeting with `{{student_name}}`

## 6. Active Issues

- ~~**Supabase CLI deploy blocked**~~ — **Resolved.** Supabase CLI authenticated.
- ~~**`get-signed-url` Edge Function**~~ — **Resolved.** Deployed successfully.
- **`process-material` uses `esm.sh` imports** — works currently but may be fragile. Consider migrating to `jsr:` imports if 503 boot failures occur.

## 7. Next Steps

**High Priority (deploy blockers):**
- [x] Authenticate Supabase CLI: `npx supabase login`
- [x] Deploy `get-signed-url` Edge Function: `npx supabase functions deploy get-signed-url --project-ref rfnxdtyzadsubosekefm`

**Validation:**
- [ ] Review and validate voice session flow end-to-end (VoiceSession.tsx)
- [ ] Verify `update-session-state` tool integration — confirm ElevenLabs agent calls the tool and mastery state persists correctly
- [ ] Validate mastery state transitions match system prompt spec (see `Voice_AI_Tutor_System_Prompt_v1.0.md`)
- [ ] Test material processing pipeline with edge-case file formats (password-protected, scanned PDFs, large files)
- [ ] Test ElevenLabs conversation history length management / token limits

**Future Improvements:**
- [ ] Consider ElevenLabs RAG knowledge base if 30k char study_material truncation becomes limiting
- [ ] Add unit tests for `src/lib/materials.ts`
- [ ] Migrate Edge Function imports from `esm.sh` to `jsr:` for reliability

## 8. Context Notes

- **GitHub:** `j-moreyra/voice-ai-tutor` (private)
- **Netlify:** voice-ai-tutor.netlify.app (auto-deploys from main)
- **Supabase project:** rfnxdtyzadsubosekefm (us-east-2)
- **Database project URL:** https://rfnxdtyzadsubosekefm.supabase.co
- **ElevenLabs Agent ID:** `agent_9001kk4wcrxmfr6rwppw6apfzqcx`
- **No CLAUDE.md exists** — project uses `Handoff-script.md` and `docs/HANDOFF.md` for context transfer
- **Key types file:** `src/types/database.ts` defines all DB table interfaces
- **Mastery states:** `not_started | in_progress | struggling | mastered | skipped`
- **Session types:** `first_session | returning | returning_completed | disconnected`
- **End reasons:** `completed | student_break | student_departure | disconnected | timeout`
- **Education levels:** `middle_school | high_school | undergraduate | graduate`
- **Supabase CLI deploy:** `npx supabase functions deploy <name> --project-ref rfnxdtyzadsubosekefm`
- **Build:** `npm run build` (TypeScript + Vite), output in `dist/`
- **Tests:** `npm test` (vitest)
- **Key dependencies:** `@elevenlabs/client@^0.15.0`, `@supabase/supabase-js@^2.49.1`, `pdfjs-dist@^5.5.207`, `mammoth@^1.11.0`, `jszip@^3.10.1`
- **Node version:** 20 (set in netlify.toml)
- **Pruning note:** The `.docx` spec files in root are reference-only; all actionable specs are captured in `database-schema.md` and the system prompt markdown
