# Voice AI Tutor — Refactoring Audit Report
Generated: 2026-03-28
Audited commit: 67caa93

## Summary
- 6 dead code findings
- 3 legacy/superseded code findings
- 3 duplicate code findings
- 1 unused dependency finding
- 3 unused file findings
- 4 code quality observations

---

## Category 1: Dead Code

### 1.1 `canAttemptDelete` function never used in application code
- **File:** `src/lib/materialInteractions.ts`
- **Lines:** 1-3
- **What:** The `canAttemptDelete` function is exported but never imported or used in any component or page. The delete logic in `MaterialCard.tsx` uses inline checks (`if (!user || deleting) return; if (!confirm(...)) return;`) instead.
- **Evidence:** `grep -r 'canAttemptDelete' src/ --include='*.tsx'` returns no results. Only references are the definition and its test file (`materialInteractions.test.ts`).
- **Safe to remove?** Yes with test updates — the 2 tests in `materialInteractions.test.ts` for `canAttemptDelete` would need to be removed.
- **Risk:** None

### 1.2 `authFlow.ts` exports never used in application code
- **File:** `src/lib/authFlow.ts`
- **Lines:** 1-11 (entire file)
- **What:** All three exports (`AUTH_CALLBACK_TIMEOUT_MS`, `shouldApplyGetSessionResult`, `hasSession`) are never imported in any `.tsx` file. The AuthCallback page uses a hardcoded `15000` timeout, AuthContext uses inline session checks, and the logic these functions encapsulate is done differently in the actual app code.
- **Evidence:** `grep -r 'from.*authFlow' src/ --include='*.tsx'` returns no results. Only references are the definition and its test file (`authFlow.test.ts`).
- **Safe to remove?** Yes with test updates — the 3 tests in `authFlow.test.ts` would need to be removed.
- **Risk:** None

### 1.3 Commented-out transcript feature in `voiceTranscript.ts`
- **File:** `src/lib/voiceTranscript.ts`
- **Lines:** 1-55 (entire file)
- **What:** The entire file is a comment explaining the feature is disabled, plus ~50 lines of commented-out code for `TranscriptMessage` type and `mergeTranscriptMessage` function. The file exports nothing.
- **Evidence:** The file contains only a comment on line 1 and commented-out code from lines 3-55. No active exports. The test file (`voiceTranscript.test.ts`) also has all its tests commented out with a single `it.skip`.
- **Safe to remove?** Yes with test updates — `voiceTranscript.test.ts` would also be removed (its 1 skipped test contributes nothing).
- **Risk:** None. If the transcript feature is re-enabled later, the commented-out code in `VoiceSession.tsx` already contains the full implementation inline.

### 1.4 Commented-out transcript code blocks in `VoiceSession.tsx`
- **File:** `src/pages/VoiceSession.tsx`
- **Lines:** 9, 13-19, 36, 56, 74-122, 275, 449-485
- **What:** Multiple commented-out code blocks related to the disabled transcript feature: imports (`@elevenlabs/types`), type definitions, state, refs, `handleMessage` callback, `onMessage` callback, and the entire live transcript UI section. This is ~80 lines of commented-out code.
- **Evidence:** Visual inspection — all blocks are prefixed with `//` and relate to the transcript feature that line 1 of `voiceTranscript.ts` confirms is "commented out for now."
- **Safe to remove?** Yes — these are dead commented-out blocks. The feature can be rebuilt from the transcript type + merge logic if needed.
- **Risk:** None

### 1.5 Commented-out speed slider and MasteryBadge in `StudyPlan.tsx`
- **File:** `src/pages/StudyPlan.tsx`
- **Lines:** 6, 91-100, 116, 210-227
- **What:** (a) Commented-out `MasteryBadge` import (line 6) and its usage in concept-level bullets (lines 91-100). (b) Commented-out `speed` state (line 116) and the voice speed slider UI (lines 210-227) — noted as disabled because "V3 TTS model does not support speed overrides."
- **Evidence:** Visual inspection — all prefixed with `//` or wrapped in `/* */` with explanatory comments.
- **Safe to remove?** Yes — both features are explicitly noted as disabled. The speed parameter is already passed via URL in `VoiceSession.tsx` from `searchParams`, so the slider can be re-added independently if TTS overrides are enabled later.
- **Risk:** None

### 1.6 Debug `console.log` statements in `materials.ts`
- **File:** `src/lib/materials.ts`
- **Lines:** 110, 125
- **What:** Two `console.log` statements in the client-side `uploadMaterial` function: one logging "Invoking background processing" with the material_id, and one logging "Background function accepted (202)". These leak material IDs to the browser console and produce noise during tests (visible in test output).
- **Evidence:** `grep 'console.log' src/lib/materials.ts` shows lines 110 and 125. The `console.error` on lines 123 and 128 are intentional error logging and should be kept.
- **Safe to remove?** Yes — tests in `materials.test.ts` would still pass (the logs are side effects visible in stdout output during tests but not asserted on).
- **Risk:** None

---

## Category 2: Legacy / Superseded Code

### 2.1 `netlify/functions/process-chunk.ts` — legacy Anthropic proxy
- **File:** `netlify/functions/process-chunk.ts`
- **Lines:** 1-110 (entire file)
- **What:** This was the original thin Netlify serverless proxy for per-chunk Anthropic API calls. It has been fully superseded by `process-material-background.mts`, which handles chunking, merging, and DB writes in a single 15-minute background function.
- **Evidence:** `grep -r 'process-chunk' src/` returns no results. The client code in `materials.ts` POSTs to `/.netlify/functions/process-material-background`. The HANDOFF.md explicitly marks this as "Superseded by background function" (line 75) and lists it under the TODO "Remove legacy" (line 248).
- **Safe to remove?** Yes
- **Risk:** None — no client code references this endpoint.

### 2.2 `supabase/functions/process-material/index.ts` — legacy Edge Function
- **File:** `supabase/functions/process-material/index.ts`
- **Lines:** 1-461 (entire file)
- **What:** The original Supabase Edge Function (v20) for material processing. Superseded by the Netlify background function because Supabase has a hard 150-second timeout that couldn't handle large documents.
- **Evidence:** `grep -r "supabase.functions.invoke('process-material" src/` returns no results. The client code in `materials.ts` uses `fetch('/.netlify/functions/process-material-background', ...)` (line 112). The HANDOFF.md lists this under "Remove legacy" TODO (line 248).
- **Safe to remove?** Yes
- **Risk:** None — no client code invokes this edge function. Note: the `supabase/functions/_shared/cors.ts` is still used by `get-signed-url` edge function (indirectly via tests), so only `process-material/` should be removed, not the `_shared/` directory.

### 2.3 `Voice_AI_HANDOFF.md` — oldest handoff document
- **File:** `Voice_AI_HANDOFF.md` (root)
- **Lines:** 1-? (entire file)
- **What:** This is the oldest of three HANDOFF files. The root `HANDOFF.md` is the most current and comprehensive. `docs/HANDOFF.md` is an older copy. `Voice_AI_HANDOFF.md` predates both and references outdated state (e.g., branch `claude/review-voice-app-docs-FwJtb`).
- **Evidence:** Three handoff files exist: `Voice_AI_HANDOFF.md`, `docs/HANDOFF.md`, `HANDOFF.md`. The root `HANDOFF.md` is the most recently updated and covers the background function migration.
- **Safe to remove?** Yes — also consider removing `docs/HANDOFF.md` since `HANDOFF.md` (root) supersedes it.
- **Risk:** None

---

## Category 3: Duplicate Code

### 3.1 CORS handling duplicated across Edge Functions
- **Files:**
  - `supabase/functions/_shared/cors.ts` (lines 1-27) — shared utilities
  - `supabase/functions/get-signed-url/index.ts` (lines 29-41) — local `buildCorsHeaders`
  - `supabase/functions/process-material/index.ts` (lines 91-113) — local `buildCorsHeaders`
  - `netlify/functions/process-chunk.ts` (lines 5-14) — local `getCorsOrigin` + ALLOWED_ORIGINS
- **What:** There is a shared CORS module (`_shared/cors.ts`) with `parseAllowedOrigins`, `isOriginAllowed`, and `buildCorsHeaders`, but neither `get-signed-url` nor `process-material` actually imports it — they each define their own local `buildCorsHeaders`. The Netlify `process-chunk.ts` has its own variant too.
- **Evidence:** `grep -r "from '.*_shared/cors'" supabase/functions/` returns no results in the edge function source files — only the test file imports from `_shared/cors`. The `get-signed-url/index.ts` defines its own `buildCorsHeaders` at line 29 and `process-material/index.ts` at line 91.
- **Suggested consolidation:** If `process-material` is removed (finding 2.2), then only `get-signed-url` remains. It could be refactored to import from `_shared/cors.ts`. However, Deno edge function imports work differently — this may not be worth the effort for a single consumer. Low priority.
- **Safe to remove?** Needs verification — depends on whether Deno import resolution supports the `_shared/` relative import in edge functions. The test (`edgeCors.test.ts`) already imports from it successfully via Node/Vitest, but runtime behavior in Deno may differ.
- **Risk:** Low

### 3.2 `PROCESSING_PROMPT` and processing logic duplicated between background function and legacy edge function
- **Files:**
  - `netlify/functions/process-material-background.mts` (lines 18-60, 92-221)
  - `supabase/functions/process-material/index.ts` (lines 20-62, 121-270)
- **What:** The `PROCESSING_PROMPT` string, `StructuredChapter`/`ProfessorQuestion`/`StructuredPlan` interfaces, `splitTextIntoChunks`, `processChunk`, and `mergePlans` functions are nearly identical between the two files. The background function version has some improvements (smaller `CHUNK_SIZE` of 8,000 vs 15,000, mastery_state initialization).
- **Evidence:** Side-by-side comparison shows the prompt is identical, and the chunking/merging logic is structurally the same.
- **Suggested consolidation:** This is moot if `process-material/index.ts` is removed (finding 2.2). No action needed beyond removing the legacy file.
- **Safe to remove?** N/A — resolves automatically with finding 2.2.
- **Risk:** None

### 3.3 `ALLOWED_ORIGINS` list repeated in 3+ files
- **Files:**
  - `netlify/functions/process-chunk.ts` (lines 5-9)
  - `netlify/functions/process-material-background.mts` (lines 8-12)
  - `supabase/functions/get-signed-url/index.ts` (lines 13-14)
  - `supabase/functions/process-material/index.ts` (lines 13-14)
- **What:** The hardcoded list `['http://localhost:5173', 'http://localhost:4173', 'https://voice-ai-tutor.netlify.app']` appears in every serverless function. Adding a new allowed origin requires updating each file.
- **Suggested consolidation:** After removing the two legacy files (findings 2.1, 2.2), this reduces to just two files (background function + get-signed-url) which run in different runtimes (Node vs Deno), so a shared module isn't practical. Could be documented as a known maintenance point. Low priority.
- **Safe to remove?** N/A — observation only
- **Risk:** Low

---

## Category 4: Unused Dependencies

### 4.1 `@anthropic-ai/sdk` in root `package.json` — only used by Netlify functions
- **File:** `package.json`
- **Lines:** 13
- **What:** `@anthropic-ai/sdk` is listed in the root `dependencies` but is only imported in `netlify/functions/process-material-background.mts` and `netlify/functions/process-chunk.ts`. It is never imported in any `src/` file. The Supabase edge function uses its own ESM import (`https://esm.sh/@anthropic-ai/sdk@0.80.0`).
- **Evidence:** `grep -r '@anthropic-ai/sdk' src/` returns no results. Only `netlify/functions/` files import it.
- **Safe to remove?** Needs verification — Netlify functions may resolve from the root `node_modules`. Moving it to `devDependencies` could work since Netlify runs `npm install` during build and includes all deps. However, removing it entirely would break the Netlify functions. The safest change is moving from `dependencies` to `devDependencies` if Netlify's build includes devDeps, or just leaving it. This is cosmetic.
- **Risk:** Medium if removed entirely (would break Netlify functions), None if moved to devDependencies.

---

## Category 5: Unused Files

### 5.1 `src/lib/voiceTranscript.ts` — entirely commented-out module
- **File:** `src/lib/voiceTranscript.ts`
- **Lines:** 1-55 (entire file)
- **What:** Contains only a comment and commented-out code. Exports nothing. No file imports from it.
- **Evidence:** `grep -r 'voiceTranscript' src/ --include='*.tsx' --include='*.ts'` shows only the test file referencing it in a comment.
- **Safe to remove?** Yes with test updates — also remove `src/lib/__tests__/voiceTranscript.test.ts`.
- **Risk:** None

### 5.2 `src/components/MaterialDetail.tsx` — component not imported anywhere
- **File:** `src/components/MaterialDetail.tsx`
- **Lines:** 1-99 (entire file)
- **What:** This component renders a material's chapter/section/concept structure in an accordion, but it is never imported or rendered in any page or other component.
- **Evidence:** `grep -r 'MaterialDetail' src/ --include='*.tsx'` returns only the component's own file. `grep -r 'import.*MaterialDetail' src/` returns no results. It's referenced in HANDOFF docs but not in code.
- **Safe to remove?** Yes — no tests reference it, no components import it.
- **Risk:** None. Note: The StudyPlan page has its own inline `ChapterAccordion` component that serves a similar purpose with mastery data.

### 5.3 `Voice_AI_HANDOFF.md` and `docs/HANDOFF.md` — superseded documentation
- **Files:** `Voice_AI_HANDOFF.md`, `docs/HANDOFF.md`
- **What:** Both are older versions of the handoff document. The root `HANDOFF.md` is the canonical, most up-to-date version covering the background function migration and current architecture.
- **Evidence:** Three HANDOFF files exist. `Voice_AI_HANDOFF.md` references an old branch. `docs/HANDOFF.md` doesn't mention the Netlify background function migration. Root `HANDOFF.md` is the most comprehensive.
- **Safe to remove?** Yes
- **Risk:** None

---

## Category 6: Code Quality Observations

These are **not** changes to make now — just patterns worth noting for future improvement.

### 6.1 Long functions
- `supabase/functions/get-signed-url/index.ts` — the main `Deno.serve` handler (lines 53-293) is ~240 lines. The dynamic variable construction (lines 162-271) could be extracted into a helper.
- `src/pages/VoiceSession.tsx` — the component is ~515 lines with complex lifecycle management. The conversation setup logic (lines 196-291) could potentially be extracted into a custom hook.

### 6.2 `any` type usage
- No explicit `any` types found in the codebase — TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` is enforced. Some `as` casts are used (e.g., `data as Material[]`) but these are reasonable given the Supabase client's generic return types.

### 6.3 `_shared/cors.ts` is tested but never imported at runtime
- The shared CORS module (`supabase/functions/_shared/cors.ts`) has a test file (`edgeCors.test.ts` with 3 passing tests) but is not imported by any edge function. If `get-signed-url` is refactored to use it, the tests become meaningful. Otherwise, the tests validate dead code.

### 6.4 `@netlify/functions` import style
- The background function imports `type { Context }` from `@netlify/functions` but the `_context` parameter is prefixed with `_` (unused). This is fine — the type import documents the handler signature.
