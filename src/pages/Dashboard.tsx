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

  // Poll every 3s while any material is still pending/processing
  useEffect(() => {
    const hasInProgress = materials.some(
      (m) => m.processing_status === 'pending' || m.processing_status === 'processing'
    )
    if (!hasInProgress) return

    const interval = setInterval(loadMaterials, 3000)
    return () => clearInterval(interval)
  }, [materials, loadMaterials])

  return (
    <div className="min-h-screen px-5 pb-10">
      <header className="mx-auto flex max-w-[640px] items-center justify-between py-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            {profile?.first_name ? `Hey ${profile.first_name}` : 'Your Materials'}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">Ready to study?</p>
        </div>
        <button
          onClick={signOut}
          className="btn-press rounded-btn border border-border px-3.5 py-2 text-sm text-text-secondary transition-colors hover:border-border-bright hover:text-text"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-[640px] space-y-8 animate-fade-in">
        <FileUpload onUploadComplete={loadMaterials} />

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton-shimmer h-[72px] rounded-card" />
            ))}
          </div>
        ) : materials.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-muted">
            No materials yet. Upload a file to get started.
          </p>
        ) : (
          <div className="stagger-fade-in space-y-3">
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
