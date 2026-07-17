import type { CSSProperties } from 'react'

// Shared style constants for the authenticated admin tool pages (AdminPage,
// SnipePage, ManageEmails, InstallExtensionModal) — same PackRadar visual
// language (mono font, hard borders, no radius) but denser than the public
// marketing pages, so kept separate from the packradar/ component set.

export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--pr-bg)',
  color: 'var(--pr-text-bright)',
  fontSize: 13,
  border: '1px solid var(--pr-border)',
  fontFamily: 'var(--pr-font-mono)',
  outline: 'none',
}

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: 'var(--pr-text-dim)',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  marginBottom: 6,
}

export const panelStyle: CSSProperties = {
  border: '1px solid var(--pr-border)',
  background: 'var(--pr-bg-panel)',
  padding: 24,
}

export const rowStyle: CSSProperties = {
  border: '1px solid var(--pr-border)',
  background: 'var(--pr-bg-panel)',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
}

export const sectionTitleStyle: CSSProperties = {
  fontFamily: 'var(--pr-font-display)',
  fontWeight: 700,
  fontSize: 20,
  color: 'var(--pr-text-bright)',
}

export const errorBoxStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--pr-status-gone)',
  color: 'var(--pr-status-gone)',
  fontSize: 12.5,
}

export const smallLinkButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--pr-text-dim)',
  fontSize: 12,
  fontFamily: 'var(--pr-font-mono)',
  cursor: 'pointer',
  padding: 0,
}

export const iconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--pr-border)',
  background: 'transparent',
  color: 'var(--pr-text-dim)',
  cursor: 'pointer',
}
