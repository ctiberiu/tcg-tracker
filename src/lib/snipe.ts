// Pure helpers for the Snipe Flow/Task builder UI (Phase 4). No React, no
// Supabase — kept here so the form→payload mapping and validation are unit-testable.
import type { SnipeFlow, SnipeMode, SnipePaymentMethod, SnipeTask, SnipeTaskStatus } from './types'

export const PAYMENT_METHODS: { value: SnipePaymentMethod; label: string }[] = [
  { value: 'card', label: 'Card (submits the order, then you confirm your card)' },
  { value: 'ramburs', label: 'Ramburs / cash on delivery (auto-place)' },
]

export const MODES: { value: SnipeMode; label: string }[] = [
  { value: 'link', label: 'Mode A — watch a product URL' },
  { value: 'keywords', label: 'Mode B — keyword search' },
]

// postMessage namespace shared with the extension's dashboard bridge (Phase 1).
export const SNIPE_DASHBOARD_SOURCE = 'snipe-dashboard'
export const SNIPE_EXT_SOURCE = 'snipe-extension'

export interface FlowFormData {
  site: string
  payment_method: SnipePaymentMethod
  shipping_method: string
  address: string
}

export interface TaskFormData {
  flow_id: string
  mode: SnipeMode
  url: string
  keywords: string // raw comma-separated input
  desired_qty: number
  respect_limit: boolean
  max_price: string // raw input; '' = no cap
  watch_until_stopped: boolean
}

export const EMPTY_FLOW_FORM: FlowFormData = {
  site: 'krit.ro',
  payment_method: 'card',
  shipping_method: '',
  address: '',
}

export const EMPTY_TASK_FORM: TaskFormData = {
  flow_id: '',
  mode: 'link',
  url: '',
  keywords: '',
  desired_qty: 1,
  respect_limit: true,
  max_price: '',
  watch_until_stopped: false,
}

/** Split a comma-separated keyword string into trimmed, non-empty, de-duped keywords. */
export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of String(raw ?? '').split(',')) {
    const k = part.trim()
    if (k && !seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase())
      out.push(k)
    }
  }
  return out
}

export interface FlowPayload {
  site: string
  payment_method: SnipePaymentMethod
  shipping_method: string | null
  address: string | null
}

export function buildFlowPayload(form: FlowFormData): FlowPayload {
  return {
    site: form.site.trim() || 'krit.ro',
    payment_method: form.payment_method,
    shipping_method: form.shipping_method.trim() || null,
    address: form.address.trim() || null,
  }
}

export function validateFlowForm(form: FlowFormData): string | null {
  if (form.payment_method !== 'card' && form.payment_method !== 'ramburs') {
    return 'Choose a payment method'
  }
  return null
}

export interface TaskPayload {
  flow_id: string
  mode: SnipeMode
  url: string | null
  keywords: string[] | null
  desired_qty: number
  respect_limit: boolean
  max_price: number | null
  watch_until_stopped: boolean
}

export function buildTaskPayload(form: TaskFormData): TaskPayload {
  const isLink = form.mode === 'link'
  const maxPriceRaw = form.max_price.trim()
  return {
    flow_id: form.flow_id,
    mode: form.mode,
    url: isLink ? form.url.trim() || null : null,
    keywords: isLink ? null : parseKeywords(form.keywords),
    desired_qty: Math.max(1, Math.trunc(Number(form.desired_qty) || 1)),
    respect_limit: form.respect_limit,
    max_price: maxPriceRaw === '' ? null : Number(maxPriceRaw),
    watch_until_stopped: form.watch_until_stopped,
  }
}

export function validateTaskForm(form: TaskFormData): string | null {
  if (!form.flow_id) return 'Select a flow for this task'
  if (form.mode === 'link') {
    if (!form.url.trim()) return 'Enter the product URL (Mode A)'
    if (!/^https?:\/\/(www\.)?krit\.ro\//i.test(form.url.trim())) return 'URL must be a krit.ro product link'
  } else {
    if (parseKeywords(form.keywords).length === 0) return 'Enter at least one keyword (Mode B)'
  }
  if (!Number.isFinite(Number(form.desired_qty)) || Number(form.desired_qty) < 1) {
    return 'Quantity must be at least 1'
  }
  const maxPriceRaw = form.max_price.trim()
  if (maxPriceRaw !== '' && !(Number(maxPriceRaw) > 0)) return 'Max price must be a positive number'
  return null
}

/** True if a window message came from the Snipe extension bridge (EXT_PRESENT / PONG / STATUS). */
export function isSnipeExtensionMessage(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === SNIPE_EXT_SOURCE
}

// ── Play/Stop trigger wiring (Phase 4 Task 3) ──
export const SNIPE_MSG = {
  START_TASK: 'START_TASK',
  STOP_TASK: 'STOP_TASK',
  STATUS: 'STATUS',
  EVENT: 'EVENT',
} as const

/** A row for the snipe_runs audit log. */
export interface SnipeRunRow {
  task_id: string
  event: string
  detail: Record<string, unknown> | null
}

/**
 * Build a snipe_runs row from an extension STATUS/EVENT push. STATUS carries a
 * `status`, EVENT carries an `event`; both carry a `taskId` + optional `detail`.
 * Returns null when there's no task id or event name to record.
 */
export function buildRunRow(payload: unknown): SnipeRunRow | null {
  const p = payload as { taskId?: unknown; status?: unknown; event?: unknown; detail?: unknown } | null
  if (!p || typeof p.taskId !== 'string' || !p.taskId) return null
  const event = typeof p.status === 'string' ? p.status : typeof p.event === 'string' ? p.event : null
  if (!event) return null
  const detail = p.detail && typeof p.detail === 'object' ? (p.detail as Record<string, unknown>) : null
  return { task_id: p.taskId, event, detail }
}

/** Payload the dashboard hands to the extension when starting a task. */
export interface TaskTriggerPayload {
  taskId: string
  mode: SnipeMode
  url: string | null
  keywords: string[] | null
  desiredQty: number
  respectLimit: boolean
  paymentMethod: SnipePaymentMethod
  shippingMethod: string | null
  address: string | null
  maxPrice: number | null
  watchUntilStopped: boolean
}

/** Combine a task with its flow into the flat payload the extension expects. */
export function buildTriggerPayload(task: SnipeTask, flow: SnipeFlow): TaskTriggerPayload {
  return {
    taskId: task.id,
    mode: task.mode,
    url: task.url,
    keywords: task.keywords,
    desiredQty: task.desired_qty,
    respectLimit: task.respect_limit,
    paymentMethod: flow.payment_method,
    shippingMethod: flow.shipping_method,
    address: flow.address,
    maxPrice: task.max_price,
    watchUntilStopped: task.watch_until_stopped,
  }
}

const PERSISTABLE_STATUSES: readonly SnipeTaskStatus[] = [
  'idle', 'running', 'grabbed', 'awaiting_payment', 'ordered', 'failed',
]

/**
 * Map a status pushed by the extension to a persistable snipe_tasks.status.
 * The loop's 'stopped' maps to 'idle'; anything unknown is ignored (null).
 */
export function statusToPersist(raw: unknown): SnipeTaskStatus | null {
  if (raw === 'stopped') return 'idle'
  return typeof raw === 'string' && (PERSISTABLE_STATUSES as readonly string[]).includes(raw)
    ? (raw as SnipeTaskStatus)
    : null
}
