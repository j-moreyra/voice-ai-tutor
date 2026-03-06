export type EducationLevel = 'middle_school' | 'high_school' | 'undergraduate' | 'graduate'

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type FileType = 'pdf' | 'docx' | 'pptx'

export type MasteryStatus = 'not_started' | 'in_progress' | 'struggling' | 'mastered' | 'skipped'

export type SessionType = 'first_session' | 'returning' | 'returning_completed' | 'disconnected'

export type EndReason = 'completed' | 'student_break' | 'student_departure' | 'disconnected' | 'timeout'

export type QuestionType = 'recall' | 'application' | 'synthesis' | 'multiple_choice' | 'true_false' | 'essay'

export type SuggestedPlacement = 'section_quiz' | 'chapter_assessment'

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

export interface ProfessorQuestion {
  id: string
  chapter_id: string
  section_id: string | null
  user_id: string
  question_text: string
  question_type: QuestionType | null
  suggested_placement: SuggestedPlacement | null
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

export interface SessionSectionCompleted {
  id: string
  session_id: string
  section_id: string
  user_id: string
  completed_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      materials: {
        Row: Material
        Insert: Omit<Material, 'id' | 'created_at' | 'updated_at' | 'processing_status'> & { processing_status?: ProcessingStatus }
        Update: Partial<Omit<Material, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      chapters: {
        Row: Chapter
        Insert: Omit<Chapter, 'id' | 'created_at'>
        Update: Partial<Omit<Chapter, 'id' | 'created_at'>>
        Relationships: []
      }
      sections: {
        Row: Section
        Insert: Omit<Section, 'id' | 'created_at'>
        Update: Partial<Omit<Section, 'id' | 'created_at'>>
        Relationships: []
      }
      concepts: {
        Row: Concept
        Insert: Omit<Concept, 'id' | 'created_at'>
        Update: Partial<Omit<Concept, 'id' | 'created_at'>>
        Relationships: []
      }
      professor_questions: {
        Row: ProfessorQuestion
        Insert: Omit<ProfessorQuestion, 'id' | 'created_at'>
        Update: Partial<Omit<ProfessorQuestion, 'id' | 'created_at'>>
        Relationships: []
      }
      mastery_state: {
        Row: MasteryState
        Insert: Omit<MasteryState, 'id' | 'updated_at'> & { status?: MasteryStatus }
        Update: Partial<Omit<MasteryState, 'id' | 'updated_at'>>
        Relationships: []
      }
      chapter_results: {
        Row: ChapterResultRecord
        Insert: Omit<ChapterResultRecord, 'id' | 'assessed_at'>
        Update: Partial<Omit<ChapterResultRecord, 'id' | 'assessed_at'>>
        Relationships: []
      }
      sessions: {
        Row: Session
        Insert: Omit<Session, 'id' | 'started_at'>
        Update: Partial<Omit<Session, 'id' | 'started_at'>>
        Relationships: []
      }
      session_sections_completed: {
        Row: SessionSectionCompleted
        Insert: Omit<SessionSectionCompleted, 'id' | 'completed_at'>
        Update: Partial<Omit<SessionSectionCompleted, 'id' | 'completed_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
