import { useState, useRef, useCallback } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { validateFile, uploadMaterial } from '../lib/materials'
import { useAuth } from '../contexts/AuthContext'

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
    const { error: uploadError } = await uploadMaterial(user.id, file, setStage)
    setStage(null)

    if (uploadError) {
      setError(uploadError)
    } else {
      onUploadComplete()
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
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-slate-700 hover:border-slate-600'
        } ${busy ? 'pointer-events-none opacity-50' : ''}`}
      >
        <svg
          className="mx-auto mb-3 h-10 w-10 text-slate-500"
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

        {stage ? (
          <p className="text-sm text-slate-400">{STAGE_LABELS[stage]}</p>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              Drop your file here or tap to browse
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PDF, DOCX, or PPTX — up to 50MB
            </p>
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
        <p className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
