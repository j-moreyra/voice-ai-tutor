import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import VoiceSessionErrorBoundary from './components/VoiceSessionErrorBoundary'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Dashboard from './pages/Dashboard'
import StudyPlan from './pages/StudyPlan'
import VoiceSession from './pages/VoiceSession'

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
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
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
      </AuthProvider>
    </BrowserRouter>
  )
}
