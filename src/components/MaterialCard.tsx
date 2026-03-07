import { useState } from 'react'
import type { Material, ProcessingStatus } from '../types/database'
import { deleteMaterial } from '../lib/materials'
import { useAuth } from '../contexts/AuthContext'

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  processing: 'bg-blue-500/10 text-blue-400 animate-pulse',
  completed: 'bg-green-500/10 text-green-400',
  failed: 'bg-red-500/10 text-red-400',
}

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Ready',
  failed: 'Failed',
}

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  pptx: 'PPTX',
}

interface MaterialCardProps {
  material: Material
  onSelect: (id: string) => void
  onDeleted: () => void
}

export default function MaterialCard({ material, onSelect, onDeleted }: MaterialCardProps) {
  const { user } = useAuth()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user || deleting) return
    if (!confirm('Delete this material and all its content?')) return

    setDeleting(true)
    await deleteMaterial(user.id, material.id, material.storage_path)
    onDeleted()
  }

  const isClickable = material.processing_status === 'completed'

  // Detect stuck processing (>3 minutes since last update)
  const isStuck =
    material.processing_status === 'processing' &&
    Date.now() - new Date(material.updated_at).getTime() > 3 * 60 * 1000

  const displayStatus = isStuck ? 'failed' : material.processing_status
  const displayLabel = isStuck ? 'Stuck' : STATUS_LABELS[material.processing_status]

  return (
    <div
      onClick={() => isClickable && onSelect(material.id)}
      className={`rounded-lg border border-slate-700 bg-slate-800 p-4 transition-colors ${
        isClickable ? 'cursor-pointer hover:border-slate-600' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">
            {material.file_name}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
              {FILE_TYPE_LABELS[material.file_type] ?? material.file_type.toUpperCase()}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[displayStatus]}`}>
              {displayLabel}
            </span>
          </div>
          {material.processing_status === 'failed' && material.processing_error && (
            <p className="mt-2 text-xs text-red-400">{material.processing_error}</p>
          )}
          {isStuck && (
            <p className="mt-2 text-xs text-red-400">
              Processing timed out. Delete and re-upload to try again.
            </p>
          )}
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-700 hover:text-slate-300 disabled:opacity-50"
          title="Delete material"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  )
}
