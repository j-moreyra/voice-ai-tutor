# Codebase Issue Task Proposals

## 1) Typo fix task
**Task:** Update the README title from `# voice-ai-tutor` to `# Voice AI Tutor` so the product name matches the in-app branding and project docs.

**Why this matters:** The current README heading reads like a repo slug, while the UI consistently presents the name as "Voice AI Tutor". This is a low-risk copy fix that improves first impressions and consistency.

**Evidence:**
- README heading is currently lowercase slug-style: `# voice-ai-tutor`.
- Sign-in page branding uses `Voice AI Tutor`.

---

## 2) Bug fix task
**Task:** Prevent duplicate refreshes after upload by ensuring `onUploadComplete` is called exactly once per successful upload.

**Why this matters:** `FileUpload` passes `onUploadComplete` into `uploadMaterial` as `onMaterialCreated`, and then also calls `onUploadComplete()` again on success. This can trigger redundant fetches/re-renders and unnecessary network traffic.

**Evidence:**
- `FileUpload` passes `onUploadComplete` into `uploadMaterial(..., onUploadComplete)`.
- `uploadMaterial` invokes `onMaterialCreated?.()` after DB insert.
- `FileUpload` then calls `onUploadComplete()` again in the success branch.

---

## 3) Documentation discrepancy task
**Task:** Reconcile Edge Function documentation so it consistently reflects what is actually in the repository (or clearly documents what exists only in the deployed Supabase project).

**Why this matters:** The handoff docs are inconsistent: one section/file tree lists only `get-signed-url` and `process-material`, while another section still describes `update-session-state` as an available function. This can mislead maintainers during onboarding and debugging.

**Evidence:**
- `HANDOFF.md` file tree lists only two functions (`get-signed-url`, `process-material`).
- `docs/HANDOFF.md` includes a dedicated section for `update-session-state`.

---

## 4) Test improvement task
**Task:** Strengthen `endSession` tests to verify the actual update payload (`ended_at` and `end_reason`) and add a failure-path assertion when Supabase update returns an error.

**Why this matters:** Current tests only verify `from('sessions')` was called and that all enum values are accepted, but they do not validate the contents of `.update(...)` or behavior on DB failure. This leaves a regression gap for session termination logic.

**Evidence:**
- Existing tests in `session.test.ts` only assert `mockFrom` call count/arguments for `endSession`.
