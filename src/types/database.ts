export type EducationLevel = 'middle_school' | 'high_school' | 'undergraduate' | 'graduate'

export const EDUCATION_LEVELS: { value: EducationLevel; label: string }[] = [
  { value: 'middle_school', label: 'Middle School' },
  { value: 'high_school', label: 'High School' },
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'graduate', label: 'Graduate' },
]

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type FileType = 'pdf' | 'docx' | 'pptx'

export type MasteryStatus = 'not_started' | 'in_progress' | 'struggling' | 'mastered' | 'skipped'

export type SessionType = 'first_session' | 'returning' | 'returning_completed' | 'disconnected'

export type EndReason = 'completed' | 'student_break' | 'student_departure' | 'disconnected' | 'timeout'

export type ChapterResult = 'mastered' | 'not_mastered'

export interface Profile {
  id: string
  first_name: string
  education_level: EducationLevel
  created_at: string
  updated_at: string
}

export interface Material {
  id: string
  user_id: string
  file_name: string
  file_type: FileType
  storage_path: string
  file_size_bytes: number | null
  processing_status: ProcessingStatus
  processing_error: string | null
  created_at: string
  updated_at: string
}

export interface Chapter {
  id: string
  material_id: string
  user_id: string
  title: string
  sort_order: number
  created_at: string
}

export interface Section {
  id: string
  chapter_id: string
  user_id: string
  title: string
  sort_order: number
  created_at: string
}

export interface Concept {
  id: string
  section_id: string
  user_id: string
  title: string
  key_facts: string | null
  sort_order: number
  created_at: string
}

export interface MasteryState {
  id: string
  concept_id: string
  user_id: string
  status: MasteryStatus
  updated_at: string
}

export interface ChapterResultRecord {
  id: string
  chapter_id: string
  user_id: string
  result: ChapterResult
  assessed_at: string
}

export interface Session {
  id: string
  user_id: string
  material_id: string
  session_type: SessionType
  current_chapter_id: string | null
  current_section_id: string | null
  current_concept_id: string | null
  started_at: string
  ended_at: string | null
  end_reason: EndReason | null
}

