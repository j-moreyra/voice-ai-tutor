import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchMaterials, subscribeMaterials } from '../lib/materials'
import type { Material } from '../types/database'
import FileUpload from '../components/FileUpload'
import MaterialCard from '../components/MaterialCard'
import MaterialDetail from '../components/MaterialDetail'

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMaterials = useCallback(async () => {
    if (!user) return
    const data = await fetchMaterials(user.id)
    setMaterials(data)
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

  useEffect(() => {
    if (!user) return
    return subscribeMaterials(user.id, loadMaterials)
  }, [user, loadMaterials])

  const selectedMaterial = materials.find((m) => m.id === selectedId)

  return (
    <div className="min-h-screen px-4 pb-8">
      <header className="mx-auto flex max-w-lg items-center justify-between py-5">
        <h1 className="text-lg font-bold text-slate-100">
          {profile?.first_name ? `${profile.first_name}'s Materials` : 'Your Materials'}
        </h1>
        <button
          onClick={signOut}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-300"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-lg space-y-6">
        <FileUpload onUploadComplete={loadMaterials} />

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading...</p>
        ) : materials.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No materials yet. Upload a file to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {materials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                selected={material.id === selectedId}
                onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
                onDeleted={() => {
                  if (selectedId === material.id) setSelectedId(null)
                  loadMaterials()
                }}
              />
            ))}
          </div>
        )}

        {selectedMaterial?.processing_status === 'completed' && (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <h2 className="mb-3 text-sm font-medium text-slate-300">Lesson Plan</h2>
            <MaterialDetail materialId={selectedMaterial.id} />
          </div>
        )}
      </main>
    </div>
  )
}
