import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { SnipePage } from './pages/SnipePage'
import { RadarFloorPage } from './pages/RadarFloorPage'
import { SignalLogPage } from './pages/SignalLogPage'
import { StoresPage } from './pages/StoresPage'
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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
