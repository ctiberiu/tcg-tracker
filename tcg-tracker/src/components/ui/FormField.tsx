import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor?: string
  /** Per-field error, shown under the control. AdminPage's store form currently shows one shared error instead — this is available for forms that want per-field messages. */
  error?: string
  children: ReactNode
  className?: string
}

/** Label + control, the pairing repeated for every field in AdminPage's store form and SnipePage's flow/task forms. */
export function FormField({ label, htmlFor, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
      {error && <p className="text-error text-xs mt-1">{error}</p>}
    </div>
  )
}
