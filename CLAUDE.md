# CLAUDE.md — Voice AI Tutor

## Project Context

This is the Voice AI Tutor — a React 18 + TypeScript PWA where students upload study materials and learn through voice conversation powered by ElevenLabs Conversational AI + Claude Sonnet 4.5.

**Key docs:** See `docs/` folder for database schema, system prompt spec, PRD, and architecture diagrams.
**Latest handoff:** See `docs/HANDOFF.md` for full project state.

---

## Handoff Generator

When I say **"create handoff"**, **"generate handoff"**, **"save context"**, or **"handoff file"**, generate a comprehensive `docs/HANDOFF.md` file that captures the full state of this project. This is critical for preserving context across sessions.

### What to capture

Scan the codebase and conversation for all of the following:

1. **Project overview** — what's being built, tech stack, key directories, reference docs
2. **Current status** — active branch, deployment URL, recent commits/work, blockers
3. **Architecture** — all backend services with IDs/URLs, all Edge Functions with descriptions, all external integrations (ElevenLabs agent ID, voice, LLM, tools configured, dynamic variables), database tables, storage buckets
4. **Environment variables** — every env var name grouped by service (Netlify, Supabase secrets). NEVER include actual secret values, only names.
5. **Key decisions** — architecture choices with rationale, patterns adopted, things that failed and why, import patterns that work vs don't
6. **Active issues** — bugs, tuning problems, partially completed work. Be specific — "get-signed-url returns 503 because esm.sh imports fail in Deno" not "Edge Function broken"
7. **Next steps** — prioritized checklist of remaining work
8. **Context notes** — repos, related projects, important constraints, file paths

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
## 5. Active Issues
## 6. Next Steps
## 7. Context Notes
```

### Quality checks before saving

- All project IDs, URLs, and service names included
- All env var NAMES listed grouped by service — never actual secret values
- All external service configs documented (agent IDs, webhook URLs)
- Key decisions include WHY not just WHAT
- Active issues are specific enough to act on
- Next steps are actionable and prioritized
- File saved to `docs/HANDOFF.md`

### Important rules

- **Never include actual API keys, passwords, or secret values** — only reference by name
- **Include project IDs and public URLs** — these are not secrets
- **Be specific about errors** — include what failed and why
- **Capture learnings** — if something took multiple attempts, document what worked and what didn't
- **Include version numbers** — if Edge Functions have been redeployed multiple times, note current version
- **Reference file paths** — include paths to important source files

---

## Project-Specific Context

### Supabase
- **Project ID:** rfnxdtyzadsubosekefm
- **URL:** https://rfnxdtyzadsubosekefm.supabase.co
- **Region:** us-east-2
- **Storage bucket:** materials (private, 50MB per file)

### Edge Functions (3 deployed)
1. `process-material` — receives extracted text from frontend, sends to Claude for structuring
2. `get-signed-url` — builds dynamic variables from DB, gets ElevenLabs signed URL
3. `update-session-state` — webhook from ElevenLabs for mastery tracking

### ElevenLabs
- **Agent ID:** agent_9001kk4wcrxmfr6rwppw6apfzqcx
- **Voice:** Dan — Warm, Conversational and Polite
- **LLM:** Claude Sonnet 4.5
- **TTS:** Flash (fastest)

### Deployment
- **Netlify:** voice-ai-tutor.netlify.app (auto-deploys from main)
- **GitHub:** j-moreyra/voice-ai-tutor (private)

### Key Patterns
- Client-side text extraction (pdfjs-dist, mammoth, jszip) — NOT server-side
- `verify_jwt: false` on all Edge Functions — auth handled internally in function code
- Edge Function imports: use `jsr:@supabase/supabase-js@2` — esm.sh imports cause 503 boot failures
- Study material passed via dynamic variable `study_material` (truncated at 30k chars) — not using ElevenLabs RAG
