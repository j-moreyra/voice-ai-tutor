import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-2xl font-bold">
        Welcome{profile?.first_name ? `, ${profile.first_name}` : ''}
      </h1>
      <p className="mb-8 text-slate-400">Your AI tutor is ready. Upload flow coming next.</p>
      <button
        onClick={signOut}
        className="rounded-lg border border-slate-700 px-6 py-3 text-base text-slate-300 hover:bg-slate-800"
      >
        Sign out
      </button>
    </div>
  )
}
