import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The /react entry point, NOT /next — this is a Vite SPA. It patches history so
// React Router navigations are recorded as pageviews without wiring anything
// into App.tsx. Cookieless (visitors are a hash of the request, discarded after
// 24h), so it needs no consent banner — but it does need the privacy policy
// page to disclose it.
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import './styles/packradar.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
