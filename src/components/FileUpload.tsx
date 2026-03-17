import { useState, useRef, useCallback } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { validateFile, uploadMaterial } from '../lib/materials'
import { useAuth } from '../contexts/AuthContext'
import { shouldShowUploadError } from '../lib/materialInteractions'

interface FileUploadProps {
  onUploadComplete: () => void
}

type UploadStage = 'extracting' | 'uploading' | 'processing' | null

const STAGE_LABELS: Record<Exclude<UploadStage, null>, string> = {
  extracting: 'Extracting text...',
  uploading: 'Uploading file...',
  processing: 'Structuring content...',
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [stage, setStage] = useState<UploadStage>(null)
  const [error, setError] = useState('')

  const busy = stage !== null

  const handleFile = useCallback(async (file: File) => {
    setError('')

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!user) return

    setStage('extracting')
    const { error: uploadError } = await uploadMaterial(
      user.id,
      file,
      setStage,
      onUploadComplete
    )
    setStage(null)

    if (shouldShowUploadError(uploadError)) {
      setError(uploadError)
    }
  }, [user, onUploadComplete])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [handleFile])

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-card border-2 border-dashed p-8 text-center transition-all duration-200 ${
          dragging
            ? 'border-accent bg-accent-soft'
            : 'border-border hover:border-border-bright hover:bg-surface/50'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${dragging ? 'bg-accent/20' : 'bg-surface'}`}>
          <svg
            className={`h-6 w-6 ${dragging ? 'text-accent' : 'text-text-muted'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        {stage ? (
          <div>
            <div className="mx-auto mb-3 h-1 w-32 overflow-hidden rounded-full bg-surface">
              <div className="h-full w-1/2 animate-shimmer rounded-full bg-accent" style={{ backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 50%, var(--color-accent) 100%)' }} />
            </div>
            <p className="text-sm text-text-secondary">{STAGE_LABELS[stage]}</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-text-secondary">
              Drop your file here or tap to browse
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-text-muted">PDF</span>
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-text-muted">DOCX</span>
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-text-muted">PPTX</span>
              <span className="text-xs text-text-muted">up to 50MB</span>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={handleInputChange}
        className="hidden"
      />

      {error && (
        <div className="mt-4 animate-fade-in rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  )
}
