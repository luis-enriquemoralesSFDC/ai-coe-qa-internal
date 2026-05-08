import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LanguageProvider } from './hooks/useLocale'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import ProjectPage from './pages/ProjectPage'
import StoryPage from './pages/StoryPage'
import MetricasPage from './pages/MetricasPage'
import AdminPage from './pages/AdminPage'
import TestPlanListPage from './pages/TestPlanListPage'
import TestPlanWizardPage from './pages/TestPlanWizardPage'
import TestPlanViewPage from './pages/TestPlanViewPage'
import TestPlanCoachPage from './pages/TestPlanCoachPage'
import Layout from './components/Layout'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>
}

export default function App() {
  return (
    <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<DashboardPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/metricas" element={<MetricasPage />} />
          <Route path="/projects/:projectId/stories/:storyId" element={<StoryPage />} />
          <Route path="/projects/:projectId/test-plans" element={<TestPlanListPage />} />
          <Route path="/projects/:projectId/test-plans/new" element={<TestPlanWizardPage />} />
          <Route path="/projects/:projectId/test-plans/:planId" element={<TestPlanViewPage />} />
          <Route path="/projects/:projectId/test-plans/:planId/edit" element={<TestPlanWizardPage />} />
          <Route path="/projects/:projectId/test-plans/:planId/coach" element={<TestPlanCoachPage />} />
          <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
  )
}
