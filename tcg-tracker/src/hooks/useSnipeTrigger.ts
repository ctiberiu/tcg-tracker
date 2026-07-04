import { useEffect, useRef, useState } from 'react'
import type { SnipeFlow, SnipeTask, SnipeTaskStatus } from '../lib/types'
import { supabase } from '../lib/supabase'
import {
  SNIPE_DASHBOARD_SOURCE,
  SNIPE_MSG,
  buildRunRow,
  buildTriggerPayload,
  isSnipeExtensionMessage,
  statusToPersist,
} from '../lib/snipe'

interface ExtMessage {
  source: string
  type?: string
  requestId?: string
  payload?: unknown
}

export interface TriggerResult {
  ok?: boolean
  reason?: string
  status?: string
  url?: string
  matchedTitle?: string
}

interface UseSnipeTriggerOptions {
  /** Called when the extension reports a persistable status for a task. */
  onStatus?: (taskId: string, status: SnipeTaskStatus) => void
}

/**
 * Play/Stop wiring: posts START_TASK / STOP_TASK to the extension bridge
 * (guardrail-6 origin-validated on the extension side) and listens for the
 * bridge's status pushes + request acks. Replaces the Phase 1 dev-stub.
 */
export function useSnipeTrigger({ onStatus }: UseSnipeTriggerOptions = {}) {
  const [liveStatus, setLiveStatus] = useState<Record<string, SnipeTaskStatus>>({})
  const pending = useRef(new Map<string, (result: TriggerResult) => void>())
  const lastStatus = useRef(new Map<string, string>()) // per-task, to de-dupe consecutive status rows
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onStatusRef.current = onStatus
  }, [onStatus])

  useEffect(() => {
    // Audit: record every status/event the extension reports into snipe_runs.
    // Fire-and-forget; a logging failure must never break the UI.
    const logRun = (payload: unknown) => {
      const row = buildRunRow(payload)
      if (!row) return
      void supabase
        .from('snipe_runs')
        .insert(row)
        .then(({ error }) => {
          if (error) console.warn('[snipe] snipe_runs insert failed:', error.message)
        })
    }

    const handler = (e: MessageEvent) => {
      if (e.source !== window || !isSnipeExtensionMessage(e.data)) return
      const data = e.data as ExtMessage

      // Live status push.
      if (data.type === SNIPE_MSG.STATUS) {
        const p = data.payload as { taskId?: string; status?: unknown } | null
        const persisted = statusToPersist(p?.status)
        if (p?.taskId && persisted) {
          // Skip consecutive duplicates (e.g. the double 'running' at start).
          if (lastStatus.current.get(p.taskId) === persisted) return
          lastStatus.current.set(p.taskId, persisted)
          setLiveStatus((prev) => ({ ...prev, [p.taskId as string]: persisted }))
          onStatusRef.current?.(p.taskId, persisted)
          logRun({ ...p, status: persisted })
        }
        return
      }

      // Non-status audit event (backoff, quantity_capped, captcha, …) — log only.
      if (data.type === SNIPE_MSG.EVENT) {
        logRun(data.payload)
        return
      }

      // Request/response ack for a START_TASK / STOP_TASK we sent.
      if (data.requestId && pending.current.has(data.requestId)) {
        const resolve = pending.current.get(data.requestId)!
        pending.current.delete(data.requestId)
        resolve((data.payload as TriggerResult) ?? {})
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const send = (type: string, payload: unknown): Promise<TriggerResult> => {
    const requestId = crypto.randomUUID()
    return new Promise((resolve) => {
      pending.current.set(requestId, resolve)
      window.postMessage({ source: SNIPE_DASHBOARD_SOURCE, type, requestId, payload }, window.origin)
      // Fall back if the extension isn't installed / never replies.
      setTimeout(() => {
        if (pending.current.has(requestId)) {
          pending.current.delete(requestId)
          resolve({ ok: false, reason: 'No response from the Snipe extension' })
        }
      }, 8000)
    })
  }

  const playTask = (task: SnipeTask, flow: SnipeFlow): Promise<TriggerResult> =>
    send(SNIPE_MSG.START_TASK, { task: buildTriggerPayload(task, flow) })

  const stopTask = (task: SnipeTask): Promise<TriggerResult> =>
    send(SNIPE_MSG.STOP_TASK, { taskId: task.id })

  return { liveStatus, playTask, stopTask }
}
