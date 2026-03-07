import type { StudyStats } from '../lib/study'

interface ProgressBarProps {
  stats: StudyStats
}

export default function ProgressBar({ stats }: ProgressBarProps) {
  if (stats.total === 0) return null

  const pct = (n: number) => `${(n / stats.total) * 100}%`

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
      <div className="flex h-full transition-all duration-500">
        {stats.mastered > 0 && (
          <div className="bg-success" style={{ width: pct(stats.mastered) }} />
        )}
        {stats.inProgress > 0 && (
          <div className="bg-accent" style={{ width: pct(stats.inProgress) }} />
        )}
        {stats.struggling > 0 && (
          <div className="bg-warning" style={{ width: pct(stats.struggling) }} />
        )}
      </div>
    </div>
  )
}
