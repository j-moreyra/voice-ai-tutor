import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchMaterials, subscribeMaterials } from '../lib/materials'
import type { Material } from '../types/database'
import FileUpload from '../components/FileUpload'
import MaterialCard from '../components/MaterialCard'

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [materials, setMaterials] = useState<Material[]>([])
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
                onSelect={(id) => navigate(`/study/${id}`)}
                onDeleted={loadMaterials}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
