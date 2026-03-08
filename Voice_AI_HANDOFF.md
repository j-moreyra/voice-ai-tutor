# HANDOFF.md — Voice AI Tutor

## 1. Project Overview

**Voice AI Tutor** — a React 18 + TypeScript PWA for AI-powered voice tutoring. Students upload course materials (PDF/DOCX/PPTX), which are processed into structured content (chapters > sections > concepts), then studied via real-time voice sessions powered by ElevenLabs.

**Stack:** React 18 / Vite 6 / Tailwind CSS 4 / Supabase (Auth, DB, Edge Functions, Storage) / ElevenLabs Conversational AI / Netlify deploy

**Key directories:**
- `src/pages/` — Route pages: Dashboard, SignIn, SignUp, StudyPlan, VoiceSession
- `src/components/` — FileUpload, MaterialCard, MaterialDetail, MasteryBadge, ProgressBar, etc.
- `src/lib/` — Core logic: supabase.ts, materials.ts, extract.ts, session.ts, study.ts
- `src/contexts/AuthContext.tsx` — Auth state provider
- `supabase/functions/` — Edge Functions: `process-material`, `get-signed-url`, `update-session-state`

**Reference docs:** `database-schema.md` (full DB schema), `Voice_AI_Tutor_System_Prompt_v1.1.md` (AI tutor behavior spec)

## 2. Current Status

**Branch:** `claude/review-voice-app-docs-FwJtb` — clean working tree
**Deployed at:** `voice-ai-tutor.netlify.app` (auto-deploys from main)

**Recent completed work (last 10 commits):**
- ElevenLabs env vars and dynamic variables integration
- Mic recording cleanup on navigation away from voice session
- Complete UI/UX dark theme overhaul
- Material card immediate display after DB row creation
- Polling for material processing status updates
- Chunk load retry with auto-reload for stale PWA cache
- Edge Function response handling and stuck processing state recovery
- Field rename (`extracted_text` → `text_content`) to match Edge Function contract
- Client-side file text extraction (pdfjs-dist, mammoth, jszip)
- Context-aware "Start Studying" button with chapter targeting

**No active blockers.** All features committed and working.

## 3. Architecture

### Supabase Backend
- **Project ID:** `rfnxdtyzadsubosekefm` (us-east-2)
- **URL:** `https://rfnxdtyzadsubosekefm.supabase.co`
- **Database:** 10 tables — profiles, materials, chapters, sections, concepts, professor_questions, mastery_state, chapter_results, sessions, session_sections_completed
- **Storage bucket:** `materials` (private, 50MB per file limit, RLS by user_id folder)
- **RLS:** Enabled on all tables, users can only access their own data
- **`extracted_text` column** on `materials` table — stores client-extracted text for passing to voice sessions via `study_material` dynamic variable

### Edge Functions (3 deployed)
1. **`process-material`** (verify_jwt: false, auth handled internally) — Receives extracted text from frontend, sends to Claude Sonnet 4 for structuring into chapters/sections/concepts, stores results in DB, saves extracted_text for later use
2. **`get-signed-url`** (verify_jwt: false, auth handled internally) — Fetches all session context from Supabase (profile, mastery state, lesson plan, study material text), builds dynamic variables, gets signed URL from ElevenLabs API, returns both to frontend
3. **`update-session-state`** (verify_jwt: false, webhook from ElevenLabs) — Receives mastery state changes from ElevenLabs tool calls during live sessions, writes to DB (concept mastery, section completion, chapter results, session position)

### ElevenLabs Conversational AI
- **Agent ID:** `agent_9001kk4wcrxmfr6rwppw6apfzqcx`
- **Voice:** Dan — Warm, Conversational and Polite
- **LLM:** Claude Sonnet 4.5
- **TTS Model:** Flash (fastest latency)
- **System prompt:** v1.1 (updated from v1.0 to fix fluff, double questions, irrelevant questions)
- **Tool configured:** `update_session_state` — webhook to Supabase Edge Function for real-time mastery tracking
- **Dynamic variables:** student_name, education_level, session_type, current_chapter, current_section, last_concept_completed, concepts_struggling, concepts_skipped, mastery_summary, days_since_last_session, lesson_plan, professor_questions, study_material, user_id, session_id
- **Knowledge Base (RAG):** Not yet used — currently passing full material text (truncated at 30k chars) via `study_material` dynamic variable
- **First message:** Uses hardcoded first message with `{{student_name}}` and `{{current_chapter}}` variables for immediate response on session connect

### Environment Variables
**Netlify (build-time):**
- `VITE_SUPABASE_URL` = `https://rfnxdtyzadsubosekefm.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = (JWT anon key)
- `VITE_ELEVENLABS_AGENT_ID` = `agent_9001kk4wcrxmfr6rwppw6apfzqcx`
- `VITE_ELEVENLABS_API_KEY` = (ElevenLabs API key)

**Supabase Edge Function secrets:**
- `ANTHROPIC_API_KEY` — for Claude API calls in process-material
- `ELEVENLABS_API_KEY` — for signed URL requests in get-signed-url
- `ELEVENLABS_AGENT_ID` — agent identifier for get-signed-url
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — auto-provided

## 4. Key Decisions

- **Client-side text extraction** over server-side — Supabase Edge Functions (Deno) have significant constraints with binary-to-base64 conversion and import availability; moving parsing to the frontend (using pdfjs-dist, mammoth, jszip — same as Pebbl) resolved a multi-version debugging cycle
- **`verify_jwt: false` + internal auth validation** — more reliable than gateway-level JWT verification for frontend-called Edge Functions; Supabase gateway rejects requests before function code runs when enabled at gateway level
- **Two-layer content grounding** in AI tutor: Layer 1 (strict curriculum from materials) + Layer 2 (flexible teaching from broader knowledge)
- **Dark theme design system** — background `#0A0A0F`, surface `#14141F`, accent `#7C5CFF`
- **PWA with Workbox auto-update** — handles stale cache with chunk load retry
- **Supabase RLS on all tables** — security enforced at DB level
- **Teach-Check pattern** — short voice chunks with mastery tracking per concept
- **Dynamic variables over RAG for MVP** — passing study material text directly to ElevenLabs via dynamic variables (truncated at 30k chars) instead of using ElevenLabs Knowledge Base RAG; simpler, more reliable for MVP
- **Edge Function import patterns:** `jsr:@supabase/supabase-js@2` and `jsr:@supabase/functions-js/edge-runtime.d.ts` work; `https://esm.sh/` imports cause 503 boot failures; `jsr:@std/encoding@1/base64` also fails at boot
- **Binary-to-base64 in Deno** requires chunked approach (8KB chunks over Uint8Array) — both `btoa(String.fromCharCode(...largeArray))` and standard library imports fail with large files
- **Storage RLS policies** use `(storage.foldername(name))[1]` pattern; bucket name mismatches silently break uploads

## 5. Active Tuning Issues

System prompt v1.1 was written to address these — not yet fully verified in testing:

1. **Tutor speaks too slowly on first connection** — system prompt approach adds Claude processing delay vs ElevenLabs' hardcoded first message field. Current fix: using ElevenLabs First message field with dynamic variables for immediate greeting.
2. **Asks "what do you know about X" before every concept** — prompt updated to only gauge knowledge at session open, then teach-first for all subsequent concepts.
3. **Overall tone has too much filler and double-questions** — v1.1 adds explicit anti-fluff rules ("2-4 sentences max per turn"), ONE QUESTION AT A TIME as "the most important rule in this entire prompt", and "NEVER sell how interesting a topic is."
4. **Irrelevant questions** — v1.1 adds "Questions must be directly answerable from the study material."

## 6. Next Steps

- [ ] Verify system prompt v1.1 fixes for fluff, double questions, and irrelevant questions in live testing
- [ ] Review and validate voice session flow end-to-end (VoiceSession.tsx:1-250)
- [ ] Verify `update-session-state` Edge Function integration with ElevenLabs tool calls
- [ ] Add error boundaries around voice session components
- [ ] Test material processing pipeline with edge-case file formats
- [ ] Validate mastery state transitions match system prompt spec
- [ ] Review session resumption logic in `src/lib/session.ts` for disconnected/returning states
- [ ] Test ElevenLabs conversation history length management during long sessions (does it truncate, summarize, or send full transcript per turn?)
- [ ] Consider ElevenLabs RAG knowledge base if `study_material` dynamic variable approach hits token limits with large documents
- [ ] Consider adding unit tests for `src/lib/extract.ts` and `src/lib/materials.ts`
- [ ] Google OAuth setup (deferred — email/password only for now)

## 7. Context Notes

- **No CLAUDE.md exists** — project relies on inline docs and the system prompt spec
- **GitHub repo:** `j-moreyra/voice-ai-tutor` (private)
- **Database project ID:** `rfnxdtyzadsubosekefm` (us-east-2)
- **Key types:** `src/types/database.ts` defines all DB table interfaces
- **Mastery states:** `not_started | in_progress | struggling | mastered | skipped`
- **Session types:** `first_session | returning | returning_completed | disconnected`
- **Pebbl app** (`j-moreyra/Pebbl`) used as design and architecture reference — file extraction pattern borrowed from Pebbl
- **Pruning note:** The `.docx` spec files in root are reference-only; all actionable specs are captured in `database-schema.md` and the system prompt markdown
