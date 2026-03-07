import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchStudyPlan, subscribeStudyPlan } from '../lib/study'
import type { StudyPlan as StudyPlanData, StudyChapter } from '../lib/study'
import MasteryBadge from '../components/MasteryBadge'
import ProgressBar from '../components/ProgressBar'

function ChapterAccordion({
  chapter,
  expanded,
  onToggle,
}: {
  chapter: StudyChapter
  expanded: boolean
  onToggle: () => void
}) {
  const conceptCount = chapter.sections.reduce((n, s) => n + s.concepts.length, 0)
  const masteredCount = chapter.sections.reduce(
    (n, s) => n + s.concepts.filter((c) => c.mastery === 'mastered').length,
    0
  )

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{chapter.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {chapter.sections.length} section{chapter.sections.length !== 1 ? 's' : ''} · {masteredCount}/{conceptCount} concepts mastered
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {chapter.result && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                chapter.result === 'mastered'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {chapter.result === 'mastered' ? 'Mastered' : 'Not mastered'}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700 px-4 pb-4 pt-3">
          {chapter.sections.map((section) => (
            <div key={section.id} className="mt-3 first:mt-0">
              <p className="text-xs font-medium text-slate-300">{section.title}</p>
              <ul className="mt-1.5 space-y-1">
                {section.concepts.map((concept) => (
                  <li key={concept.id} className="flex items-center gap-2 pl-3">
                    <MasteryBadge status={concept.mastery} />
                    <span className="text-xs text-slate-400">{concept.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StudyPlan() {
  const { materialId } = useParams<{ materialId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<StudyPlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user || !materialId) return
    const data = await fetchStudyPlan(user.id, materialId)
    setPlan(data)
    setLoading(false)
  }, [user, materialId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!user || !materialId) return
    return subscribeStudyPlan(user.id, materialId, load)
  }, [user, materialId, load])

  if (loading) {
    return (
      <div className="min-h-screen px-4 pb-8">
        <div className="mx-auto max-w-lg py-16 text-center text-sm text-slate-500">Loading...</div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="min-h-screen px-4 pb-8">
        <div className="mx-auto max-w-lg py-16 text-center">
          <p className="text-sm text-slate-500">Material not found.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300">
            ← Back to Materials
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 pb-8">
      <header className="mx-auto max-w-lg py-5">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-300">
          ← Back to Materials
        </Link>
        <h1 className="mt-3 text-lg font-bold text-slate-100">{plan.material.file_name}</h1>

        <div className="mt-4 space-y-2">
          <ProgressBar stats={plan.stats} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>{plan.stats.mastered}/{plan.stats.total} mastered</span>
            {plan.stats.inProgress > 0 && <span>{plan.stats.inProgress} in progress</span>}
            {plan.stats.struggling > 0 && <span>{plan.stats.struggling} struggling</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3">
        {plan.chapters.map((chapter) => (
          <ChapterAccordion
            key={chapter.id}
            chapter={chapter}
            expanded={expandedChapterId === chapter.id}
            onToggle={() =>
              setExpandedChapterId(expandedChapterId === chapter.id ? null : chapter.id)
            }
          />
        ))}

        <button
          onClick={() => {
            const targetChapterId =
              expandedChapterId ??
              plan.chapters.find((ch) =>
                ch.sections.some((s) => s.concepts.some((c) => c.mastery !== 'mastered'))
              )?.id ??
              plan.chapters[0]?.id
            if (targetChapterId) {
              navigate(`/session/${materialId}?chapterId=${targetChapterId}`)
            }
          }}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500"
        >
          {expandedChapterId
            ? `Start from: ${plan.chapters.find((ch) => ch.id === expandedChapterId)?.title}`
            : 'Start Studying'}
        </button>
      </main>
    </div>
  )
}
