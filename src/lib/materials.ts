import { supabase } from './supabase'
import { extractText } from './extract'
import type { Material, Chapter, Section, Concept, FileType } from '../types/database'

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const ACCEPTED_EXTENSIONS: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

export function validateFile(file: File): string | null {
  const mimeType = ACCEPTED_TYPES[file.type]
  const extensionType = ACCEPTED_EXTENSIONS[getExtension(file.name)]

  if (!mimeType || !extensionType || mimeType !== extensionType) {
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
  onProgress?: (stage: 'extracting' | 'uploading' | 'processing') => void,
  onMaterialCreated?: () => void
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
    return { error: 'Could not extract any text from this file. The file may be image-based, empty, or contain only diagrams. Try a text-based version of the file.' }
  }

  if (extractedText.trim().length < 100) {
    return { error: 'Very little text was extracted from this file. The file may be mostly images or diagrams. Voice tutoring works best with text-heavy materials.' }
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

  // 4. Notify caller so the material card appears immediately
  onMaterialCreated?.()

  // 5. Kick off background processing via Netlify background function.
  //    Background functions get a 15-minute timeout — enough for large documents.
  //    The function returns 202 immediately; processing happens asynchronously.
  onProgress?.('processing')
  const materialId = (material as Material).id

  await supabase
    .from('materials')
    .update({ processing_status: 'processing' })
    .eq('id', materialId)

  const { data: { session } } = await supabase.auth.getSession()
  console.log('[uploadMaterial] Invoking background processing', { material_id: materialId })

  fetch('/.netlify/functions/process-material-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      material_id: materialId,
      text_content: extractedText,
      user_id: userId,
      auth_token: session?.access_token,
    }),
  }).then((res) => {
    if (!res.ok) {
      console.error('[uploadMaterial] Background function returned', res.status)
    } else {
      console.log('[uploadMaterial] Background function accepted (202)')
    }
  }).catch((err) => {
    console.error('[uploadMaterial] Background function invocation failed:', err)
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
  const chaptersRes = await supabase
    .from('chapters')
    .select('*')
    .eq('material_id', materialId)
    .order('sort_order')

  const chapters = (chaptersRes.data as Chapter[]) ?? []
  const chapterIds = chapters.map((c) => c.id)

  const sectionsRes = chapterIds.length
    ? await supabase.from('sections').select('*').in('chapter_id', chapterIds).order('sort_order')
    : { data: [] }

  const sections = (sectionsRes.data as Section[]) ?? []
  const sectionIds = sections.map((s) => s.id)

  const conceptsRes = sectionIds.length
    ? await supabase.from('concepts').select('*').in('section_id', sectionIds).order('sort_order')
    : { data: [] }

  const concepts = (conceptsRes.data as Concept[]) ?? []

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
