# Voice AI Tutor — Database Schema Reference

## Supabase Project Details
- **Project ID:** rfnxdtyzadsubosekefm
- **URL:** https://rfnxdtyzadsubosekefm.supabase.co
- **Region:** us-east-2
- **Storage bucket:** `materials` (private, 50MB per file limit)

## Edge Functions
- `process-material` (JWT required) — material processing pipeline
- `update-session-state` (no JWT, webhook) — mastery tracking from ElevenLabs

---

## Table: profiles
Extends Supabase auth.users. Created on user registration.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | — | PK, references auth.users(id) ON DELETE CASCADE |
| first_name | text | NO | — | |
| education_level | text | NO | — | CHECK: middle_school, high_school, undergraduate, graduate |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated via trigger |

---

## Table: materials
Uploaded study files. One row per file.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| file_name | text | NO | — | Original filename |
| file_type | text | NO | — | CHECK: pdf, docx, pptx |
| storage_path | text | NO | — | Path in Supabase Storage bucket |
| file_size_bytes | bigint | YES | — | |
| processing_status | text | NO | 'pending' | CHECK: pending, processing, completed, failed |
| processing_error | text | YES | — | Error message if processing failed |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated via trigger |

---

## Table: chapters
Top-level structure from material processing.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| material_id | uuid | NO | — | FK → materials(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| title | text | NO | — | |
| sort_order | integer | NO | 0 | Ordering within the material |
| created_at | timestamptz | NO | now() | |

---

## Table: sections
Sections within chapters.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| chapter_id | uuid | NO | — | FK → chapters(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| title | text | NO | — | |
| sort_order | integer | NO | 0 | Ordering within the chapter |
| created_at | timestamptz | NO | now() | |

---

## Table: concepts
Individual teachable units within sections.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| section_id | uuid | NO | — | FK → sections(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| title | text | NO | — | Concept name |
| key_facts | text | YES | — | Extracted key facts, definitions, relationships |
| sort_order | integer | NO | 0 | Ordering within the section |
| created_at | timestamptz | NO | now() | |

---

## Table: professor_questions
Assessment questions detected in uploaded materials.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| chapter_id | uuid | NO | — | FK → chapters(id) ON DELETE CASCADE |
| section_id | uuid | YES | — | FK → sections(id) ON DELETE SET NULL (null = chapter-level) |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| question_text | text | NO | — | Original question text |
| question_type | text | YES | — | CHECK: recall, application, synthesis, multiple_choice, true_false, essay |
| suggested_placement | text | YES | — | CHECK: section_quiz, chapter_assessment |
| created_at | timestamptz | NO | now() | |

---

## Table: mastery_state
Per-concept per-user mastery tracking. Updated in real time during sessions.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| concept_id | uuid | NO | — | FK → concepts(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| status | text | NO | 'not_started' | CHECK: not_started, in_progress, struggling, mastered, skipped |
| updated_at | timestamptz | NO | now() | Auto-updated via trigger |

**UNIQUE constraint:** (concept_id, user_id)

---

## Table: chapter_results
Chapter assessment outcomes.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| chapter_id | uuid | NO | — | FK → chapters(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| result | text | NO | — | CHECK: mastered, not_mastered |
| assessed_at | timestamptz | NO | now() | |

**UNIQUE constraint:** (chapter_id, user_id)

---

## Table: sessions
Session history with current position tracking.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| material_id | uuid | NO | — | FK → materials(id) ON DELETE CASCADE |
| session_type | text | NO | — | CHECK: first_session, returning, returning_completed, disconnected |
| current_chapter_id | uuid | YES | — | FK → chapters(id) ON DELETE SET NULL |
| current_section_id | uuid | YES | — | FK → sections(id) ON DELETE SET NULL |
| current_concept_id | uuid | YES | — | FK → concepts(id) ON DELETE SET NULL |
| started_at | timestamptz | NO | now() | |
| ended_at | timestamptz | YES | — | Null if session is active |
| end_reason | text | YES | — | CHECK: completed, student_break, student_departure, disconnected, timeout |

---

## Table: session_sections_completed
Tracks which sections have passed their quiz within a session.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | PK |
| session_id | uuid | NO | — | FK → sessions(id) ON DELETE CASCADE |
| section_id | uuid | NO | — | FK → sections(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| completed_at | timestamptz | NO | now() | |

**UNIQUE constraint:** (session_id, section_id)

---

## Relationships (hierarchy)

```
profiles (user)
  └── materials (uploaded files)
       └── chapters
            ├── sections
            │    ├── concepts
            │    │    └── mastery_state (per concept per user)
            │    └── professor_questions (section-level)
            ├── professor_questions (chapter-level)
            └── chapter_results
  └── sessions
       └── session_sections_completed
```

---

## Row Level Security
All tables have RLS enabled. Users can only read/write their own data (filtered by user_id = auth.uid()). Edge Functions use the service_role key which bypasses RLS for server-side operations.

## Indexes
- materials(user_id)
- chapters(material_id)
- sections(chapter_id)
- concepts(section_id)
- mastery_state(user_id, concept_id)
- mastery_state(user_id, status)
- sessions(user_id)
- professor_questions(chapter_id)

## Storage
- Bucket: `materials` (private)
- File path convention: `{user_id}/{filename}`
- Max file size: 50MB
- RLS: users can only access files in their own user_id folder
