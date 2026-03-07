import { useEffect, useState } from 'react'
import { fetchMaterialStructure } from '../lib/materials'
import type { MaterialStructure } from '../lib/materials'

interface MaterialDetailProps {
  materialId: string
}

export default function MaterialDetail({ materialId }: MaterialDetailProps) {
  const [structure, setStructure] = useState<MaterialStructure | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    fetchMaterialStructure(materialId).then((data) => {
      setStructure(data)
      setLoading(false)
      if (data.chapters.length > 0) {
        setExpandedChapters(new Set([data.chapters[0].id]))
      }
    })
  }, [materialId])

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return <p className="py-4 text-center text-sm text-slate-500">Loading lesson plan...</p>
  }

  if (!structure || structure.chapters.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">No content extracted.</p>
  }

  return (
    <div className="space-y-1">
      {structure.chapters.map((chapter, ci) => {
        const isExpanded = expandedChapters.has(chapter.id)
        return (
          <div key={chapter.id}>
            <button
              onClick={() => toggleChapter(chapter.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-slate-700/50"
            >
              <svg
                className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              <span>Chapter {ci + 1}: {chapter.title}</span>
            </button>

            {isExpanded && (
              <div className="ml-5 border-l border-slate-700 pl-4">
                {chapter.sections.map((section, si) => (
                  <div key={section.id} className="py-1">
                    <p className="text-sm font-medium text-slate-300">
                      {ci + 1}.{si + 1} {section.title}
                    </p>
                    {section.concepts.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {section.concepts.map((concept) => (
                          <li key={concept.id} className="flex items-center gap-2 py-0.5 pl-3 text-xs text-slate-400">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                            {concept.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {chapter.sections.length === 0 && (
                  <p className="py-1 text-xs text-slate-500">No sections</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
