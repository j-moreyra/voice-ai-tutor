# Handoff-script.md — Voice AI Tutor

## Project Context

This is the Voice AI Tutor — a React 18 + TypeScript PWA where students upload study materials and learn through voice conversation powered by ElevenLabs Conversational AI + Claude Sonnet 4.5.

**Key docs:** See `docs/` folder for database schema, system prompt spec, PRD, and architecture diagrams.
**Latest handoff:** See `docs/HANDOFF.md` for full project state.

---

## Handoff Generator

When I say **"create handoff"**, **"generate handoff"**, **"save context"**, or **"handoff file"**, generate a comprehensive `docs/HANDOFF.md` file that captures the full state of this project. This is critical for preserving context across sessions.

### CRITICAL: Cumulative History

**Each handoff is a CUMULATIVE document.** It must include relevant history from all prior sessions, not just the current one. A new handoff replaces the previous one — it is the single source of truth.

**Before writing anything:**
1. Read the existing `docs/HANDOFF.md` if it exists
2. Carry forward all relevant information (architecture, key decisions, learnings, prior work history)
3. Update any information that has changed (e.g., new system prompt version replaces old, but note the progression)
4. Move completed items from "Next Steps" into the Prior Work History section
5. Never delete prior history — each handoff adds to Section 5, it never shrinks

### What to capture

Scan the codebase and conversation for all of the following:

1. **Project overview** — what's being built, tech stack, key directories, reference docs
2. **Current status** — active branch, deployment URL, work completed THIS SESSION with detail, blockers
3. **Architecture** — all backend services with IDs/URLs, all Edge Functions with descriptions, all external integrations (ElevenLabs agent ID, voice, LLM, tools configured, dynamic variables), database tables, RPC functions, triggers, storage buckets
4. **Key decisions** — architecture choices with rationale, patterns adopted, things that failed and why, import patterns that work vs don't. CUMULATIVE across all sessions — never drop decisions from prior handoffs.
5. **Prior work history** — work completed in PREVIOUS sessions, organized by date. This section grows with each handoff. Move the previous handoff's "Current Status" work into here.
6. **Environment variables** — every env var name grouped by service (Netlify, Supabase secrets). NEVER include actual secret values, only names.
7. **Active issues** — bugs, tuning problems, partially completed work. Be specific — "get-signed-url returns 503 because esm.sh imports fail in Deno" not "Edge Function broken"
8. **Next steps** — prioritized checklist of remaining work, grouped by dependency/blocker if applicable
9. **Context notes** — repos, related projects, important constraints, file paths, type definitions

### Output format

Use this exact structure:

```markdown
# HANDOFF.md — Voice AI Tutor

## 1. Project Overview
## 2. Current Status
## 3. Architecture
### Supabase Backend
### Edge Functions
### ElevenLabs Conversational AI
### Environment Variables
## 4. Key Decisions
## 5. Prior Work History
## 6. Active Issues
## 7. Next Steps
## 8. Context Notes
```

### Section 5 Rules (Prior Work History)

- **On first handoff:** This section may be empty or contain initial setup work.
- **On subsequent handoffs:** Move the PREVIOUS handoff's "Current Status / recent work" into this section. The current session's work goes in Section 2.
- **Never delete prior history** — each handoff adds to this section, it never shrinks.
- **Organize by session date** (e.g., "March 8, 2026 session:" or "Initial build phase:").
- **Keep it scannable** — bullet points with enough context to understand what was done, not full paragraphs.
- **Include the progression of key artifacts** — e.g., "System prompt v1.0 → v1.1 → v1.2" with what changed at each step.

### Quality checks before saving

- All project IDs, URLs, and service names included
- All env var NAMES listed grouped by service — never actual secret values
- All external service configs documented (agent IDs, webhook URLs)
- Key decisions include WHY not just WHAT
- Key decisions are CUMULATIVE — decisions from prior handoffs are preserved
- Active issues are specific enough to act on
- Next steps are actionable and prioritized
- Prior work history includes all relevant work from previous sessions
- Completed items from the previous "Next Steps" appear in history, not still in Next Steps
- The new handoff fully REPLACES the old one — no information was lost
- File saved to `docs/HANDOFF.md`

### Important rules

- **Each handoff is cumulative and replaces the previous one** — it is the single source of truth
- **Never lose information between handoff versions** — if something was in the old handoff and is still relevant, it must be in the new one
- **Never include actual API keys, passwords, or secret values** — only reference by name
- **Include project IDs and public URLs** — these are not secrets
- **Be specific about errors** — include what failed and why
- **Capture learnings** — if something took multiple attempts, document what worked and what didn't
- **Include version numbers** — if Edge Functions have been redeployed multiple times, note current version
- **Reference file paths** — include paths to important source files
- **Track artifact progression** — when something evolves across sessions (system prompts, schemas, Edge Functions), note the version history

---

## Project-Specific Context

### Supabase
- **Project ID:** rfnxdtyzadsubosekefm
- **URL:** https://rfnxdtyzadsubosekefm.supabase.co
- **Region:** us-east-2
- **Storage bucket:** materials (private, 50MB per file)
- **RPC Functions:** check_material_completion(p_user_id, p_material_id)
- **Triggers:** validate_mastery_transition on mastery_state, set_mastery_state_updated_at on mastery_state

### Edge Functions (3 deployed)
1. `process-material` — receives extracted text from frontend, sends to Claude for structuring
2. `get-signed-url` — builds dynamic variables from DB, gets ElevenLabs signed URL
3. `update-session-state` — webhook from ElevenLabs for mastery tracking

### ElevenLabs
- **Agent ID:** agent_9001kk4wcrxmfr6rwppw6apfzqcx
- **Voice:** Dan — Warm, Conversational and Polite
- **LLM:** Claude Sonnet 4.5
- **TTS:** Flash (fastest)
- **System prompt:** v1.2 (teach-first, AI speaks first, informal tone)
- **First message:** Short greeting with {{student_name}} for immediate audio on connect

### Deployment
- **Netlify:** voice-ai-tutor.netlify.app (auto-deploys from main)
- **GitHub:** j-moreyra/voice-ai-tutor (private)
- **Supabase CLI deploy:** requires `npx supabase login` first, then `npx supabase functions deploy <function-name> --project-ref rfnxdtyzadsubosekefm`

### Key Patterns
- Client-side text extraction (pdfjs-dist, mammoth, jszip) — NOT server-side
- `verify_jwt: false` on all Edge Functions — auth handled internally in function code
- Edge Function imports: use `jsr:@supabase/supabase-js@2` — esm.sh imports cause 503 boot failures
- Study material passed via dynamic variable `study_material` (truncated at 30k chars) — not using ElevenLabs RAG
- `sessionTools.ts` runs on the FRONTEND with anon key + user JWT — not a webhook. RLS INSERT policies are critical for this to work.
