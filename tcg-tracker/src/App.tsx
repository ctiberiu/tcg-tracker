import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { SnipePage } from './pages/SnipePage'
import { RadarFloorPage } from './pages/RadarFloorPage'
import { SignalLogPage } from './pages/SignalLogPage'
import { StoresPage } from './pages/StoresPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Public pages — no login required */}
        <Route path="/" element={<RadarFloorPage />} />
        <Route path="/view" element={<SignalLogPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/snipe"
          element={
            <ProtectedRoute>
              <SnipePage />
            </ProtectedRoute>
          }
        />
        {/* Was <Navigate to="/login" replace />, which rendered the login page for every
            non-existent URL — unlimited distinct URLs, one duplicate body. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
