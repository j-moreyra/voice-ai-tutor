import { useState } from 'react'
import type { Material, ProcessingStatus } from '../types/database'
import { deleteMaterial } from '../lib/materials'
import { useAuth } from '../contexts/AuthContext'
import { canAttemptDelete } from '../lib/materialInteractions'

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  pending: 'bg-warning-soft text-warning',
  processing: 'bg-accent-soft text-accent',
  completed: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
}

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: 'Pending',
  processing: 'Analyzing...',
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
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = confirm('Delete this material and all its content?')
    if (!canAttemptDelete({ hasUser: Boolean(user), deleting, confirmed })) return

    setDeleteError(null)
    setDeleting(true)

    const error = await deleteMaterial(user!.id, material.id, material.storage_path)
    if (error) {
      setDeleteError(error)
      setDeleting(false)
      return
    }

    onDeleted()
  }

  const isClickable = material.processing_status === 'completed'
  const isProcessing = material.processing_status === 'processing' || material.processing_status === 'pending'

  // Detect stuck processing (>3 minutes since last update)
  const isStuck =
    material.processing_status === 'processing' &&
    Date.now() - new Date(material.updated_at).getTime() > 3 * 60 * 1000

  const displayStatus = isStuck ? 'failed' : material.processing_status
  const displayLabel = isStuck ? 'Stuck' : STATUS_LABELS[material.processing_status]

  return (
    <div
      onClick={() => isClickable && onSelect(material.id)}
      className={`group rounded-card border border-border bg-surface p-5 transition-all duration-200 ${
        isClickable
          ? 'cursor-pointer hover:-translate-y-px hover:border-border-bright hover:shadow-lg hover:shadow-black/20'
          : ''
      } ${isProcessing && !isStuck ? 'border-accent/20' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {material.file_name}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-muted">
              {FILE_TYPE_LABELS[material.file_type] ?? material.file_type.toUpperCase()}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[displayStatus]}`}>
              {isProcessing && !isStuck && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              )}
              {displayLabel}
            </span>
          </div>

          {isProcessing && !isStuck && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
              <div className="skeleton-shimmer h-full w-full rounded-full" />
            </div>
          )}

          {material.processing_status === 'failed' && material.processing_error && (
            <p className="mt-2.5 text-xs text-danger">{material.processing_error}</p>
          )}
          {isStuck && (
            <p className="mt-2.5 text-xs text-danger">
              Processing timed out. Delete and re-upload to try again.
            </p>
          )}

          {deleteError && (
            <p className="mt-2.5 text-xs text-danger">Delete failed: {deleteError}</p>
          )}

          {isClickable && (
            <p className="mt-2.5 text-xs text-text-muted group-hover:text-accent">
              View Study Plan &rarr;
            </p>
          )}
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded-btn p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary disabled:opacity-50"
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
