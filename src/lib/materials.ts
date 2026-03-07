import { supabase } from './supabase'
import { extractText } from './extract'
import type { Material, Chapter, Section, Concept, FileType } from '../types/database'

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES[file.type]) {
    return 'Only PDF, DOCX, and PPTX files are accepted.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'This file is over 50MB. Try splitting it into smaller sections or compressing images.'
  }
  return null
}

export function getFileType(file: File): FileType {
  return ACCEPTED_TYPES[file.type]!
}

export async function uploadMaterial(
  userId: string,
  file: File,
  onProgress?: (stage: 'extracting' | 'uploading' | 'processing') => void
): Promise<{ error: string | null }> {
  // 1. Extract text client-side
  onProgress?.('extracting')
  const fileType = getFileType(file)
  let extractedText: string
  try {
    extractedText = await extractText(file, fileType)
  } catch (err) {
    return { error: `Text extraction failed: ${(err as Error).message}` }
  }

  if (!extractedText.trim()) {
    return { error: 'Could not extract any text from this file. The file may be image-based or empty.' }
  }

  // 2. Upload file to storage
  onProgress?.('uploading')
  const storagePath = `${userId}/${Date.now()}_${file.name}`

  const { error: storageError } = await supabase.storage
    .from('materials')
    .upload(storagePath, file, { upsert: false })

  if (storageError) {
    return { error: `Storage upload failed: ${storageError.message}` }
  }

  // 3. Create material record
  const { data: material, error: insertError } = await supabase
    .from('materials')
    .insert({
      user_id: userId,
      file_name: file.name,
      file_type: fileType,
      storage_path: storagePath,
      file_size_bytes: file.size,
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from('materials').remove([storagePath])
    return { error: `Database insert failed: ${insertError.message}` }
  }

  // 4. Fire-and-forget: send extracted text to Edge Function for structuring
  onProgress?.('processing')
  const { data: { session } } = await supabase.auth.getSession()
  supabase.functions.invoke('process-material', {
    body: {
      material_id: (material as Material).id,
      text_content: extractedText,
    },
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
    },
  })

  return { error: null }
}

export async function fetchMaterials(userId: string): Promise<Material[]> {
  const { data } = await supabase
    .from('materials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data as Material[]) ?? []
}

export interface MaterialStructure {
  chapters: (Chapter & {
    sections: (Section & {
      concepts: Concept[]
    })[]
  })[]
}

export async function fetchMaterialStructure(materialId: string): Promise<MaterialStructure> {
  const [chaptersRes, sectionsRes, conceptsRes] = await Promise.all([
    supabase.from('chapters').select('*').eq('material_id', materialId).order('sort_order'),
    supabase.from('sections').select('*').order('sort_order'),
    supabase.from('concepts').select('*').order('sort_order'),
  ])

  const chapters = (chaptersRes.data as Chapter[]) ?? []
  const allSections = (sectionsRes.data as Section[]) ?? []
  const allConcepts = (conceptsRes.data as Concept[]) ?? []

  const chapterIds = new Set(chapters.map((c) => c.id))

  const sections = allSections.filter((s) => chapterIds.has(s.chapter_id))
  const sectionIds = new Set(sections.map((s) => s.id))
  const concepts = allConcepts.filter((c) => sectionIds.has(c.section_id))

  return {
    chapters: chapters.map((chapter) => ({
      ...chapter,
      sections: sections
        .filter((s) => s.chapter_id === chapter.id)
        .map((section) => ({
          ...section,
          concepts: concepts.filter((c) => c.section_id === section.id),
        })),
    })),
  }
}

export async function deleteMaterial(userId: string, materialId: string, storagePath: string): Promise<string | null> {
  const { error: storageError } = await supabase.storage
    .from('materials')
    .remove([storagePath])

  if (storageError) {
    return storageError.message
  }

  const { error: dbError } = await supabase
    .from('materials')
    .delete()
    .eq('id', materialId)
    .eq('user_id', userId)

  return dbError?.message ?? null
}

export function subscribeMaterials(userId: string, onUpdate: () => void) {
  const channel = supabase
    .channel('materials-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'materials',
        filter: `user_id=eq.${userId}`,
      },
      onUpdate
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
