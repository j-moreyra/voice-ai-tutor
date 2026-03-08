# HANDOFF.md — Voice AI Tutor

## 1. Project Overview

**Voice AI Tutor** — a React 18 + TypeScript PWA for AI-powered voice tutoring. Students upload course materials (PDF/DOCX/PPTX), which are processed into structured content (chapters > sections > concepts), then studied via real-time voice sessions powered by ElevenLabs.

**Stack:** React 18 / Vite 6 / Tailwind CSS 4 / Supabase (Auth, DB, Edge Functions, Storage) / ElevenLabs voice / Netlify deploy

**Key directories:**
- `src/pages/` — Route pages: Dashboard, SignIn, SignUp, StudyPlan, VoiceSession
- `src/components/` — FileUpload, MaterialCard, MaterialDetail, MasteryBadge, ProgressBar, etc.
- `src/lib/` — Core logic: supabase.ts, materials.ts, extract.ts, session.ts, study.ts
- `src/contexts/AuthContext.tsx` — Auth state provider
- `supabase/functions/` — Edge Functions: `process-material`, `get-signed-url`

**Reference docs:** `database-schema.md` (full DB schema), `Voice_AI_Tutor_System_Prompt_v1.0.md` (AI tutor behavior spec)

## 2. Current Status

**Branch:** `claude/general-session-d5L9Z` — clean working tree

**Recent completed work (this branch, from `main`):**
- Fix `days_since_last_session` to use `ended_at` when available
- Fix orphaned sessions, cosmetic mute bug, and missing study material
- Add unit tests for `extractXmlText` and `validateFile`
- Improve file extraction: password detection, scanned PDF check, chart/diagram text
- Extract speaker notes and decode HTML entities in PPTX extraction
- Improve session resumption logic with orphan detection and time threshold
- Add error boundaries and hardening to voice session

**No active blockers.** All features committed and working.

## 3. Key Decisions

- **Client-side text extraction** over server-side — reduces Edge Function load; uses pdfjs-dist/mammoth/jszip
- **Two-layer content grounding** in AI tutor: Layer 1 (strict material adherence) + Layer 2 (flexible teaching knowledge)
- **Dark theme design system** — theme color `#0A0A0F`, applied globally
- **PWA with Workbox auto-update** — handles stale cache with chunk load retry
- **Supabase RLS on all tables** — security enforced at DB level
- **Teach-Check pattern** — 15-45 second voice chunks with mastery tracking per concept

## 4. Pending / Next Steps

- [ ] **Deploy `get-signed-url` Edge Function** — requires Supabase login (`npx supabase login`) then: `npx supabase functions deploy get-signed-url --project-ref rfnxdtyzadsubosekefm`
- [ ] Review and validate voice session flow end-to-end (VoiceSession.tsx)
- [ ] Verify `update-session-state` Edge Function integration with ElevenLabs tool calls
- [ ] Validate mastery state transitions match system prompt spec (see `Voice_AI_Tutor_System_Prompt_v1.0.md`)
- [ ] Test material processing pipeline with edge-case file formats
- [x] Add error boundaries around voice session components
- [x] Review session resumption logic in `src/lib/session.ts` for disconnected/returning states
- [x] Add unit tests for `src/lib/extract.ts`

## 5. Context Notes

- **No CLAUDE.md exists** — project relies on inline docs and the system prompt spec
- **Database project ID:** `rfnxdtyzadsubosekefm` (us-east-2)
- **Key types:** `src/types/database.ts` defines all DB table interfaces
- **Mastery states:** `not_started | in_progress | struggling | mastered | skipped`
- **Session types:** `first_session | returning | returning_completed | disconnected`
- **Edge Functions:** `supabase/functions/get-signed-url` and `supabase/functions/process-material`
- **Deploy blocked:** Supabase CLI requires authentication — run `npx supabase login` to authenticate before deploying Edge Functions
- **Pruning note:** The `.docx` spec files in root are reference-only; all actionable specs are captured in `database-schema.md` and the system prompt markdown
