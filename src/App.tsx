import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { SnipePage } from './pages/SnipePage'
import { RadarFloorPage } from './pages/RadarFloorPage'
import { SignalLogPage } from './pages/SignalLogPage'
import { StoresPage } from './pages/StoresPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { GameLandingPage } from './pages/GameLandingPage'
import { GAME_PAGES } from './lib/gamePages'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PushPrompt } from './components/packradar'
import { PushDebugPage } from './pages/PushDebugPage'

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
        {/* Unlinked workshop tool for the notification-tap path — an installed
            iOS web app has no console, so this is the only way to see what the
            service worker actually did. Disallowed in robots.txt. */}
        <Route path="/push-debug" element={<PushDebugPage />} />
        {/* Romanian game landing pages. Generated from the registry rather than
            listed here, so adding a game is one entry in gamePages.ts and a route
            list can never fall out of step with it. */}
        {GAME_PAGES.map((page) => (
          <Route key={page.path} path={page.path} element={<GameLandingPage page={page} />} />
        ))}
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
      {/* Rendered once, outside <Routes>, so it survives navigation. Inside the
          router because the sheet links back into the app. A per-page instance
          would race two service worker registrations against each other. */}
      <PushPrompt />
    </BrowserRouter>
  )
}

export default App
