import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import VoiceSessionErrorBoundary from './components/VoiceSessionErrorBoundary'

const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const SignIn = lazy(() => import('./pages/SignIn'))
const SignUp = lazy(() => import('./pages/SignUp'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const StudyPlan = lazy(() => import('./pages/StudyPlan'))
const VoiceSession = lazy(() => import('./pages/VoiceSession'))

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
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
              </div>
            }
          >
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
          </Suspense>
        </HashRedirect>
      </AuthProvider>
    </BrowserRouter>
  )
}
