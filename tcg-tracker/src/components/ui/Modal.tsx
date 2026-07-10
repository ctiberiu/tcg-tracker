import { useEffect, type ReactNode } from 'react'
import { Card } from './Card'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Tailwind max-width class for the panel, e.g. "max-w-lg" (default) or "max-w-2xl". */
  maxWidth?: string
}

/**
 * Overlay + panel shell generalized from InstallExtensionModal: backdrop click
 * and Escape both close, the panel itself doesn't propagate clicks to the
 * backdrop. Header is a title plus a close icon button.
 */
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
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
      aria-label={title}
    >
      <Card
        rounded="2xl"
        padding="lg"
        className={`w-full ${maxWidth} max-h-[85vh] overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-xl font-bold text-on-surface">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>
        {children}
      </Card>
    </div>
  )
}
