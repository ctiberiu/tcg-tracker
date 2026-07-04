import { useEffect } from 'react'

export const EXTENSION_ZIP_URL = '/snipe-extension.zip'

interface InstallExtensionModalProps {
  open: boolean
  onClose: () => void
}

const steps: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Download & unzip',
    body: (
      <>
        Download the extension and unzip it. You&apos;ll get a{' '}
        <code className="text-primary">snipe-extension</code> folder — keep it somewhere permanent
        (Chrome loads it from this location, so don&apos;t delete it after installing).
      </>
    ),
  },
  {
    title: 'Open the extensions page',
    body: (
      <>
        In Chrome, go to <code className="text-primary">chrome://extensions</code>.
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
        <code className="text-primary">snipe-extension</code> folder.
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Install the Snipe extension"
    >
      <div
        className="bg-surface-low rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-xl font-bold text-on-surface">Install the Snipe extension</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-high transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-on-surface-variant text-sm mb-4">
          Chrome only (Manifest V3), installed in developer mode. It runs entirely in your own
          browser using your own krit.ro session — no credentials are stored.
        </p>

        <a
          href={EXTENSION_ZIP_URL}
          download="snipe-extension.zip"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors mb-5"
        >
          Download extension (.zip)
        </a>

        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div>
                <p className="text-on-surface text-sm font-bold">{step.title}</p>
                <p className="text-on-surface-variant text-sm">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 pt-5 border-t border-outline-variant">
          <h3 className="text-on-surface text-sm font-bold mb-1">Multiple Krit accounts?</h3>
          <p className="text-on-surface-variant text-sm">
            There&apos;s no in-app account switching (and nothing is ever stored). To run more than
            one Krit account, use a{' '}
            <a
              href="https://support.google.com/chrome/answer/2364824"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
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
