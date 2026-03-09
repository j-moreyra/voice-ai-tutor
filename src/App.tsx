import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import VoiceSessionErrorBoundary from './components/VoiceSessionErrorBoundary'
import AuthCallback from './pages/AuthCallback'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import StudyPlan from './pages/StudyPlan'
import VoiceSession from './pages/VoiceSession'

/** If the URL hash contains an access_token (OAuth redirect), send to /auth/callback */
function HashRedirect({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (
    location.pathname !== '/auth/callback' &&
    location.hash.includes('access_token=')
  ) {
    return <Navigate to={`/auth/callback${location.hash}`} replace />
  }
  return <>{children}</>
}

function VoiceSessionWithErrorBoundary() {
  const { materialId } = useParams<{ materialId: string }>()
  return (
    <VoiceSessionErrorBoundary materialId={materialId}>
      <VoiceSession />
    </VoiceSessionErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HashRedirect>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study/:materialId"
            element={
              <ProtectedRoute>
                <StudyPlan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/session/:materialId"
            element={
              <ProtectedRoute>
                <VoiceSessionWithErrorBoundary />
              </ProtectedRoute>
            }
          />
        </Routes>
        </HashRedirect>
      </AuthProvider>
    </BrowserRouter>
  )
}
