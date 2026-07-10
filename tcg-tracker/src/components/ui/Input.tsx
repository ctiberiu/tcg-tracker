import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

type FieldVariant = 'container' | 'low' | 'bordered'

interface FieldStyleProps {
  /** "container" = AdminPage's form fields (bg-surface-container). "low" = DashboardPage's
   *  filter bar (bg-surface-low, since it sits directly on the page background, not a card).
   *  "bordered" = LoginPage's larger, bordered look. */
  variant?: FieldVariant
  /** AdminPage's form fields are always full-width; DashboardPage's filter fields size themselves individually (w-24, min-w-[...]) — default false. */
  fullWidth?: boolean
  className?: string
}

const baseClass = 'px-3 py-2 rounded font-mono text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary'
const variantClass: Record<FieldVariant, string> = {
  container: `${baseClass} bg-surface-container`,
  low: `${baseClass} bg-surface-low`,
  bordered:
    'w-full px-4 py-3 rounded font-mono bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 text-sm focus:outline-none focus:border-primary transition-colors',
}

function fieldClasses({ variant = 'container', fullWidth = false, className = '' }: FieldStyleProps) {
  return [variantClass[variant], variant !== 'bordered' && fullWidth ? 'w-full' : '', className].filter(Boolean).join(' ')
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldStyleProps {}

/** Shared text input. Covers AdminPage's form fields (container, fullWidth), DashboardPage's filter bar (low), and LoginPage (bordered). */
export function Input({ variant, fullWidth, className, ...props }: InputProps) {
  return <input className={fieldClasses({ variant, fullWidth, className })} {...props} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldStyleProps {}

/** Shares the exact input styling — AdminPage's scraper-type dropdown uses the same className as its text inputs. */
export function Select({ variant, fullWidth, className, ...props }: SelectProps) {
  return <select className={fieldClasses({ variant, fullWidth, className })} {...props} />
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldStyleProps {}

export function Textarea({ variant, fullWidth, className, ...props }: TextareaProps) {
  return <textarea className={fieldClasses({ variant, fullWidth, className })} {...props} />
}
