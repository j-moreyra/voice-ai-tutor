import type { MasteryStatus } from '../types/database'

const CONFIG: Record<MasteryStatus, { bg: string; label: string }> = {
  not_started: { bg: 'bg-slate-500', label: 'Not started' },
  in_progress: { bg: 'bg-blue-500', label: 'In progress' },
  struggling: { bg: 'bg-amber-500', label: 'Struggling' },
  mastered: { bg: 'bg-green-500', label: 'Mastered' },
  skipped: { bg: 'bg-slate-400', label: 'Skipped' },
}

interface MasteryBadgeProps {
  status: MasteryStatus
  showLabel?: boolean
}

export default function MasteryBadge({ status, showLabel = false }: MasteryBadgeProps) {
  const { bg, label } = CONFIG[status]

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${bg}`} />
      {showLabel && <span className="text-xs text-slate-400">{label}</span>}
    </span>
  )
}
