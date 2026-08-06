import { useEffect, type ReactNode } from 'react'
import { CtaButton, iconButtonStyle } from './packradar'

export const EXTENSION_ZIP_URL = '/snipe-extension.zip'

interface InstallExtensionModalProps {
  open: boolean
  onClose: () => void
}

const codeStyle = { color: 'var(--pr-signal)', fontFamily: 'var(--pr-font-mono)' }

const steps: { title: string; body: ReactNode }[] = [
  {
    title: 'Download & unzip',
    body: (
      <>
        Download the extension and unzip it. You&apos;ll get a{' '}
        <code style={codeStyle}>snipe-extension</code> folder — keep it somewhere permanent
        (Chrome loads it from this location, so don&apos;t delete it after installing).
      </>
    ),
  },
  {
    title: 'Open the extensions page',
    body: (
      <>
        In Chrome, go to <code style={codeStyle}>chrome://extensions</code>.
      </>
    ),
  },
  {
    title: 'Enable Developer mode',
    body: <>Toggle <strong>Developer mode</strong> on (top-right of the extensions page).</>,
  },
  {
    title: 'Load unpacked',
    body: (
      <>
        Click <strong>Load unpacked</strong> and select the unzipped{' '}
        <code style={codeStyle}>snipe-extension</code> folder.
      </>
    ),
  },
  {
    title: 'Confirm it loaded',
    body: <>Return here — the status banner above should change to <strong>“Snipe extension detected.”</strong></>,
  },
]

export function InstallExtensionModal({ open, onClose }: InstallExtensionModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="packradar"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Install the Snipe extension"
    >
      <div
        style={{
          background: 'var(--pr-bg-panel)',
          border: '1px solid var(--pr-border-hover)',
          padding: 24,
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 18, color: 'var(--pr-text-bright)' }}>
            Install the Snipe extension
          </h2>
          <button onClick={onClose} aria-label="Close" style={iconButtonStyle}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p style={{ color: 'var(--pr-text-dim)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          Chrome only (Manifest V3), installed in developer mode. It runs entirely in your own
          browser using your own krit.ro session — no credentials are stored.
        </p>

        <div style={{ marginBottom: 20 }}>
          <CtaButton variant="solid" size="sm" href={EXTENSION_ZIP_URL} download="snipe-extension.zip">
            DOWNLOAD EXTENSION (.ZIP)
          </CtaButton>
        </div>

        <ol style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 0, margin: 0, listStyle: 'none' }}>
          {steps.map((step, i) => (
            <li key={step.title} style={{ display: 'flex', gap: 12 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  border: '1px solid var(--pr-signal)',
                  color: 'var(--pr-signal)',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: 'var(--pr-font-mono)',
                }}
              >
                {i + 1}
              </span>
              <div>
                <p style={{ color: 'var(--pr-text-bright)', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{step.title}</p>
                <p style={{ color: 'var(--pr-text-dim)', fontSize: 12.5, lineHeight: 1.6 }}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--pr-border)' }}>
          <h3 style={{ color: 'var(--pr-text-bright)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Multiple Krit accounts?</h3>
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 12.5, lineHeight: 1.6 }}>
            There&apos;s no in-app account switching (and nothing is ever stored). To run more than
            one Krit account, use a{' '}
            <a
              href="https://support.google.com/chrome/answer/2364824"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--pr-signal)' }}
            >
              separate Chrome profile
            </a>{' '}
            per account: create a profile, sign into that Krit account in it, and install this
            extension there too (repeat the steps above in each profile). Each profile keeps its
            own session, so its Snipe tasks act only on that account. Run one profile at a time.
          </p>
        </div>
      </div>
    </div>
  )
}
