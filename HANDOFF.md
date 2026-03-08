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

**Branch:** `claude/review-voice-app-docs-FwJtb` — clean working tree

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

## 3. Key Decisions

- **Client-side text extraction** over server-side — reduces Edge Function load; uses pdfjs-dist/mammoth/jszip
- **Two-layer content grounding** in AI tutor: Layer 1 (strict material adherence) + Layer 2 (flexible teaching knowledge)
- **Dark theme design system** — theme color `#0A0A0F`, applied globally
- **PWA with Workbox auto-update** — handles stale cache with chunk load retry
- **Supabase RLS on all tables** — security enforced at DB level
- **Teach-Check pattern** — 15-45 second voice chunks with mastery tracking per concept

## 4. Next Steps

- [ ] Review and validate voice session flow end-to-end (VoiceSession.tsx:1-250)
- [ ] Verify `update-session-state` Edge Function integration with ElevenLabs tool calls
- [ ] Add error boundaries around voice session components
- [ ] Test material processing pipeline with edge-case file formats
- [ ] Validate mastery state transitions match system prompt spec (see `Voice_AI_Tutor_System_Prompt_v1.0.md`)
- [ ] Review session resumption logic in `src/lib/session.ts` for disconnected/returning states
- [ ] Consider adding unit tests for `src/lib/extract.ts` and `src/lib/materials.ts`

## 5. Context Notes

- **No CLAUDE.md exists** — project relies on inline docs and the system prompt spec
- **Database project ID:** `rfnxdtyzadsubosekefm` (us-east-2)
- **Key types:** `src/types/database.ts` defines all DB table interfaces
- **Mastery states:** `not_started | in_progress | struggling | mastered | skipped`
- **Session types:** `first_session | returning | returning_completed | disconnected`
- **Pruning note:** The `.docx` spec files in root are reference-only; all actionable specs are captured in `database-schema.md` and the system prompt markdown
