import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchStudyPlan, subscribeStudyPlan } from '../lib/study'
import type { StudyPlan as StudyPlanData, StudyChapter } from '../lib/study'
// import MasteryBadge from '../components/MasteryBadge' // Hidden: concept-level bullets removed from study plan view
import ProgressBar from '../components/ProgressBar'

function MasteryRing({ mastered, total }: { mastered: number; total: number }) {
  const pct = total > 0 ? mastered / total : 0
  const circumference = 2 * Math.PI * 18
  const offset = circumference * (1 - pct)

  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--color-surface-hover)" strokeWidth="3" />
        <circle
          cx="20" cy="20" r="18" fill="none"
          stroke={pct === 1 ? 'var(--color-success)' : 'var(--color-accent)'}
          strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-text-secondary">
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}

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
    <div className={`rounded-card border transition-all duration-200 ${expanded ? 'border-accent/30 bg-surface' : 'border-border bg-surface hover:border-border-bright'}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-5 text-left"
      >
        <MasteryRing mastered={masteredCount} total={conceptCount} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">{chapter.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {chapter.sections.length} section{chapter.sections.length !== 1 ? 's' : ''} · {masteredCount}/{conceptCount} mastered
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {chapter.result && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                chapter.result === 'mastered'
                  ? 'bg-success-soft text-success'
                  : 'bg-danger-soft text-danger'
              }`}
            >
              {chapter.result === 'mastered' ? 'Mastered' : 'Not mastered'}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
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
        <div className="animate-fade-in border-t border-border px-5 pb-5 pt-4">
          {chapter.sections.map((section) => (
            <div key={section.id} className="mt-4 first:mt-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{section.title}</p>
              {/* Concept-level bullets hidden — too granular for the study plan view
              <ul className="mt-2 space-y-1.5">
                {section.concepts.map((concept) => (
                  <li key={concept.id} className="flex items-center gap-2.5 pl-1">
                    <MasteryBadge status={concept.mastery} />
                    <span className="text-xs text-text-secondary">{concept.title}</span>
                  </li>
                ))}
              </ul>
              */}
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
  // const [speed, setSpeed] = useState(1.0) // Disabled: V3 TTS model does not support speed overrides

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
      <div className="min-h-screen px-5 pb-8">
        <div className="mx-auto max-w-[640px] py-6">
          <div className="skeleton-shimmer h-4 w-32 rounded-md" />
          <div className="skeleton-shimmer mt-4 h-6 w-48 rounded-md" />
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-shimmer h-20 rounded-card" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="min-h-screen px-5 pb-8">
        <div className="mx-auto max-w-[640px] py-20 text-center">
          <p className="text-sm text-text-muted">Material not found.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-accent hover:text-accent-hover">
            &larr; Back to Materials
          </Link>
        </div>
      </div>
    )
  }

  const masteryPct = plan.stats.total > 0
    ? Math.round((plan.stats.mastered / plan.stats.total) * 100)
    : 0

  return (
    <div className="min-h-screen px-5 pb-28">
      <header className="mx-auto max-w-[640px] py-6 animate-fade-in">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-secondary">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back
        </Link>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-text">{plan.material.file_name}</h1>

        <div className="mt-5 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Overall Mastery</span>
            <span className="text-sm font-bold text-accent">{masteryPct}%</span>
          </div>
          <div className="mt-3">
            <ProgressBar stats={plan.stats} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>{plan.stats.mastered}/{plan.stats.total} mastered</span>
            {plan.stats.inProgress > 0 && <span>{plan.stats.inProgress} in progress</span>}
            {plan.stats.struggling > 0 && <span className="text-warning">{plan.stats.struggling} struggling</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[640px] stagger-fade-in space-y-3">
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
      </main>

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-bg/90 px-5 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
        <div className="mx-auto max-w-[640px] py-4">
          {/* Voice speed slider — commented out: V3 TTS model does not support speed overrides
          <div className="mb-3 flex items-center gap-3">
            <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
            <span className="text-xs text-text-secondary">Speed</span>
            <input
              type="range"
              min="0.7"
              max="1.2"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
            />
            <span className="w-8 text-right text-xs font-medium text-accent">{speed.toFixed(1)}x</span>
          </div>
          */}

          <button
            onClick={() => {
              const targetChapterId =
                expandedChapterId ??
                plan.chapters.find((ch) =>
                  ch.sections.some((s) => s.concepts.some((c) => c.mastery !== 'mastered'))
                )?.id ??
                plan.chapters[0]?.id
              if (targetChapterId) {
                // Find the first section with unmastered concepts in the target chapter
                const targetChapter = plan.chapters.find((ch) => ch.id === targetChapterId)
                const targetSectionId = targetChapter?.sections.find((s) =>
                  s.concepts.some((c) => c.mastery !== 'mastered')
                )?.id ?? targetChapter?.sections[0]?.id
                const params = new URLSearchParams()
                params.set('chapterId', targetChapterId)
                if (targetSectionId) params.set('sectionId', targetSectionId)
                if (targetChapter?.title) params.set('chapter', targetChapter.title)
                const targetSection = targetChapter?.sections.find((s) => s.id === targetSectionId)
                if (targetSection?.title) params.set('section', targetSection.title)
                navigate(`/session/${materialId}?${params}`)
              }
            }}
            className="btn-press h-[48px] w-full rounded-btn bg-accent text-base font-semibold text-white shadow-[0_0_24px_var(--color-accent-glow)] transition-all duration-200 hover:bg-accent-hover hover:shadow-[0_0_30px_var(--color-accent-glow)]"
          >
            {expandedChapterId
              ? `Start from: ${plan.chapters.find((ch) => ch.id === expandedChapterId)?.title}`
              : 'Start Studying'}
          </button>
        </div>
      </div>
    </div>
  )
}
