import { useState } from 'react'
import { AppSidebar } from '../components/AppSidebar'
import { useSnipeFlows } from '../hooks/useSnipeFlows'
import { useSnipeTasks } from '../hooks/useSnipeTasks'
import { useExtensionDetected } from '../hooks/useExtensionDetected'
import { useSnipeTrigger } from '../hooks/useSnipeTrigger'
import { InstallExtensionModal, EXTENSION_ZIP_URL } from '../components/InstallExtensionModal'
import {
  StatusDot,
  CtaButton,
  fieldStyle,
  labelStyle,
  panelStyle,
  rowStyle,
  sectionTitleStyle,
  errorBoxStyle,
} from '../components/packradar'
import {
  PAYMENT_METHODS,
  MODES,
  EMPTY_FLOW_FORM,
  EMPTY_TASK_FORM,
  buildFlowPayload,
  buildTaskPayload,
  validateFlowForm,
  validateTaskForm,
  type FlowFormData,
  type TaskFormData,
} from '../lib/snipe'
import type { SnipeFlow, SnipeTask, SnipeTaskStatus } from '../lib/types'

const STATUS_COLOR: Record<SnipeTaskStatus, string> = {
  idle: 'var(--pr-text-dim)',
  running: 'var(--pr-signal)',
  grabbed: 'var(--pr-signal)',
  awaiting_payment: 'var(--pr-status-preorder)',
  ordered: 'var(--pr-status-preorder)',
  failed: 'var(--pr-status-gone)',
}

export function SnipePage() {
  const { detected, checking } = useExtensionDetected()
  const { flows, loading: flowsLoading, error: flowsError, addFlow, updateFlow, deleteFlow } = useSnipeFlows()
  const { tasks, loading: tasksLoading, error: tasksError, addTask, updateTask, deleteTask } = useSnipeTasks()

  // Play/Stop + live status: the extension pushes status back; we persist it.
  const { liveStatus, playTask, stopTask } = useSnipeTrigger({
    onStatus: (taskId, status) => {
      updateTask(taskId, { status }).catch(() => {})
    },
  })
  const [triggerMsg, setTriggerMsg] = useState<Record<string, string>>({})
  const [showInstall, setShowInstall] = useState(false)

  const handlePlay = async (task: SnipeTask) => {
    const flow = flows.find((f) => f.id === task.flow_id)
    if (!flow) {
      setTriggerMsg((m) => ({ ...m, [task.id]: 'Flow not found' }))
      return
    }
    setTriggerMsg((m) => ({ ...m, [task.id]: '' }))
    const res = await playTask(task, flow)
    if (res.ok === false) {
      setTriggerMsg((m) => ({ ...m, [task.id]: res.reason ?? res.status ?? 'Failed to start' }))
    }
  }

  const handleStop = async (task: SnipeTask) => {
    setTriggerMsg((m) => ({ ...m, [task.id]: '' }))
    await stopTask(task)
  }

  // ── Flow form ──
  const [showFlowForm, setShowFlowForm] = useState(false)
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)
  const [flowForm, setFlowForm] = useState<FlowFormData>(EMPTY_FLOW_FORM)
  const [flowFormError, setFlowFormError] = useState<string | null>(null)
  const [savingFlow, setSavingFlow] = useState(false)

  const openAddFlow = () => {
    setEditingFlowId(null)
    setFlowForm(EMPTY_FLOW_FORM)
    setFlowFormError(null)
    setShowFlowForm(true)
  }

  const openEditFlow = (flow: SnipeFlow) => {
    setEditingFlowId(flow.id)
    setFlowForm({
      site: flow.site,
      payment_method: flow.payment_method,
      shipping_method: flow.shipping_method ?? '',
      address: flow.address ?? '',
    })
    setFlowFormError(null)
    setShowFlowForm(true)
  }

  const handleSaveFlow = async () => {
    const validationError = validateFlowForm(flowForm)
    if (validationError) {
      setFlowFormError(validationError)
      return
    }
    setSavingFlow(true)
    setFlowFormError(null)
    try {
      const payload = buildFlowPayload(flowForm)
      if (editingFlowId) {
        await updateFlow(editingFlowId, payload)
      } else {
        await addFlow(payload)
      }
      setShowFlowForm(false)
    } catch (err) {
      setFlowFormError(err instanceof Error ? err.message : 'Failed to save flow')
    }
    setSavingFlow(false)
  }

  const handleDeleteFlow = async (flow: SnipeFlow) => {
    if (!confirm(`Delete this flow (${flow.site} · ${flow.payment_method})? Its tasks will also be deleted.`)) return
    try {
      await deleteFlow(flow.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete flow')
    }
  }

  // ── Task form ──
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskForm, setTaskForm] = useState<TaskFormData>(EMPTY_TASK_FORM)
  const [taskFormError, setTaskFormError] = useState<string | null>(null)
  const [savingTask, setSavingTask] = useState(false)

  const openAddTask = () => {
    setEditingTaskId(null)
    setTaskForm({ ...EMPTY_TASK_FORM, flow_id: flows[0]?.id ?? '' })
    setTaskFormError(null)
    setShowTaskForm(true)
  }

  const openEditTask = (task: SnipeTask) => {
    setEditingTaskId(task.id)
    setTaskForm({
      flow_id: task.flow_id,
      mode: task.mode,
      url: task.url ?? '',
      keywords: (task.keywords ?? []).join(', '),
      desired_qty: task.desired_qty,
      respect_limit: task.respect_limit,
      max_price: task.max_price != null ? String(task.max_price) : '',
      watch_until_stopped: task.watch_until_stopped,
    })
    setTaskFormError(null)
    setShowTaskForm(true)
  }

  const handleSaveTask = async () => {
    const validationError = validateTaskForm(taskForm)
    if (validationError) {
      setTaskFormError(validationError)
      return
    }
    setSavingTask(true)
    setTaskFormError(null)
    try {
      const payload = buildTaskPayload(taskForm)
      if (editingTaskId) {
        await updateTask(editingTaskId, payload)
      } else {
        await addTask(payload)
      }
      setShowTaskForm(false)
    } catch (err) {
      setTaskFormError(err instanceof Error ? err.message : 'Failed to save task')
    }
    setSavingTask(false)
  }

  const handleDeleteTask = async (task: SnipeTask) => {
    if (!confirm('Delete this task?')) return
    try {
      await deleteTask(task.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  const flowLabel = (flow: SnipeFlow) =>
    `${flow.site} · ${flow.payment_method}${flow.shipping_method ? ` · ${flow.shipping_method}` : ''}`

  return (
    <div className="packradar" style={{ minHeight: '100vh', display: 'flex' }}>
      <AppSidebar activePage="snipe" />

      <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        <div style={{ fontSize: 10.5, color: 'var(--pr-signal)', letterSpacing: 2, marginBottom: 24 }}>
          /// PACKRADAR OPERATOR CONSOLE
        </div>

        {/* Extension status banner */}
        <div
          style={{
            padding: '10px 14px',
            border: `1px solid ${checking ? 'var(--pr-border)' : detected ? 'var(--pr-signal)' : 'var(--pr-status-gone)'}`,
            fontSize: 13,
            marginBottom: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: checking ? 'var(--pr-text-dim)' : detected ? 'var(--pr-signal)' : 'var(--pr-status-gone)',
          }}
        >
          <StatusDot color={checking ? 'var(--pr-text-dim)' : detected ? 'var(--pr-signal)' : 'var(--pr-status-gone)'} size={8} />
          {checking
            ? 'Checking for the Snipe extension…'
            : detected
              ? 'Snipe extension detected.'
              : 'Snipe extension not installed — install it to run tasks.'}
        </div>

        {/* Get the extension */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <CtaButton variant="solid" size="sm" href={EXTENSION_ZIP_URL} download="snipe-extension.zip">
            DOWNLOAD EXTENSION
          </CtaButton>
          <CtaButton variant="ghost" size="sm" onClick={() => setShowInstall(true)}>
            HOW TO INSTALL
          </CtaButton>
        </div>

        <InstallExtensionModal open={showInstall} onClose={() => setShowInstall(false)} />

        {/* ── Flows ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={sectionTitleStyle}>Flows</h2>
          <CtaButton variant="solid" size="sm" onClick={openAddFlow}>+ ADD FLOW</CtaButton>
        </div>

        {flowsError && (
          <div style={{ ...errorBoxStyle, marginBottom: 16 }}>Failed to load flows: {flowsError}</div>
        )}
        {flowsLoading && <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading flows…</p>}

        {showFlowForm && (
          <div style={{ ...panelStyle, marginBottom: 20 }}>
            <h3 style={{ ...sectionTitleStyle, fontSize: 16, marginBottom: 16 }}>{editingFlowId ? 'Edit Flow' : 'Add Flow'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Site</label>
                <input type="text" value={flowForm.site} disabled style={{ ...fieldStyle, opacity: 0.6 }} />
              </div>
              <div>
                <label style={labelStyle}>Payment Method</label>
                <select
                  value={flowForm.payment_method}
                  onChange={(e) => setFlowForm({ ...flowForm, payment_method: e.target.value as FlowFormData['payment_method'] })}
                  style={fieldStyle}
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Shipping Method (optional)</label>
                <input
                  type="text"
                  value={flowForm.shipping_method}
                  onChange={(e) => setFlowForm({ ...flowForm, shipping_method: e.target.value })}
                  style={fieldStyle}
                  placeholder="e.g. Curier / Easybox"
                />
              </div>
              <div>
                <label style={labelStyle}>Address (optional — blank = account default)</label>
                <input
                  type="text"
                  value={flowForm.address}
                  onChange={(e) => setFlowForm({ ...flowForm, address: e.target.value })}
                  style={fieldStyle}
                  placeholder="Saved address label"
                />
              </div>
            </div>
            {flowFormError && <p style={{ color: 'var(--pr-status-gone)', fontSize: 12.5, marginTop: 12 }}>{flowFormError}</p>}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <CtaButton variant="solid" size="sm" onClick={handleSaveFlow} disabled={savingFlow}>
                {savingFlow ? 'SAVING…' : 'SAVE'}
              </CtaButton>
              <CtaButton variant="ghost" size="sm" onClick={() => setShowFlowForm(false)}>CANCEL</CtaButton>
            </div>
          </div>
        )}

        {!flowsLoading && flows.length === 0 && (
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 13, marginBottom: 32 }}>No flows yet. Add one to configure checkout.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 40 }}>
          {flows.map((flow) => (
            <div key={flow.id} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--pr-text-bright)' }}>
                  {flowLabel(flow)}
                </h3>
                <p style={{ color: 'var(--pr-text-dim)', fontSize: 11 }}>
                  {flow.address ? `Address: ${flow.address}` : 'Address: account default'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <CtaButton variant="ghost" size="sm" onClick={() => openEditFlow(flow)}>EDIT</CtaButton>
                <CtaButton variant="ghost" size="sm" onClick={() => handleDeleteFlow(flow)}>DELETE</CtaButton>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tasks ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={sectionTitleStyle}>Tasks</h2>
          <CtaButton variant="solid" size="sm" onClick={openAddTask} disabled={flows.length === 0} title={flows.length === 0 ? 'Add a flow first' : undefined}>
            + ADD TASK
          </CtaButton>
        </div>

        {tasksError && (
          <div style={{ ...errorBoxStyle, marginBottom: 16 }}>Failed to load tasks: {tasksError}</div>
        )}
        {tasksLoading && <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading tasks…</p>}

        {showTaskForm && (
          <div style={{ ...panelStyle, marginBottom: 20 }}>
            <h3 style={{ ...sectionTitleStyle, fontSize: 16, marginBottom: 16 }}>{editingTaskId ? 'Edit Task' : 'Add Task'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Flow</label>
                <select
                  value={taskForm.flow_id}
                  onChange={(e) => setTaskForm({ ...taskForm, flow_id: e.target.value })}
                  style={fieldStyle}
                >
                  {flows.map((flow) => (
                    <option key={flow.id} value={flow.id}>{flowLabel(flow)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Mode</label>
                <select
                  value={taskForm.mode}
                  onChange={(e) => setTaskForm({ ...taskForm, mode: e.target.value as TaskFormData['mode'] })}
                  style={fieldStyle}
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              {taskForm.mode === 'link' ? (
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Product URL (Mode A)</label>
                  <input
                    type="url"
                    value={taskForm.url}
                    onChange={(e) => setTaskForm({ ...taskForm, url: e.target.value })}
                    style={fieldStyle}
                    placeholder="https://krit.ro/produs/…"
                  />
                </div>
              ) : (
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Keywords (comma-separated, Mode B)</label>
                  <input
                    type="text"
                    value={taskForm.keywords}
                    onChange={(e) => setTaskForm({ ...taskForm, keywords: e.target.value })}
                    style={fieldStyle}
                    placeholder="pokemon, prismatic, elite"
                  />
                </div>
              )}
              <div>
                <label style={labelStyle}>Desired Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={taskForm.desired_qty}
                  onChange={(e) => setTaskForm({ ...taskForm, desired_qty: Number(e.target.value) })}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Max Price (optional, RON)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={taskForm.max_price}
                  onChange={(e) => setTaskForm({ ...taskForm, max_price: e.target.value })}
                  style={fieldStyle}
                  placeholder="No cap"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                <input
                  type="checkbox"
                  id="respect_limit"
                  checked={taskForm.respect_limit}
                  onChange={(e) => setTaskForm({ ...taskForm, respect_limit: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: 'var(--pr-signal)' }}
                />
                <label htmlFor="respect_limit" style={{ color: 'var(--pr-text-mid)', fontSize: 13 }}>Respect per-person limit</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, gridColumn: 'span 2' }}>
                <input
                  type="checkbox"
                  id="watch_until_stopped"
                  checked={taskForm.watch_until_stopped}
                  onChange={(e) => setTaskForm({ ...taskForm, watch_until_stopped: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: 'var(--pr-signal)', marginTop: 2 }}
                />
                <label htmlFor="watch_until_stopped" style={{ color: 'var(--pr-text-mid)', fontSize: 13 }}>
                  Keep checking until I stop it
                  <span style={{ display: 'block', color: 'var(--pr-text-dim)', fontSize: 11.5, marginTop: 2 }}>
                    Ignores the normal error give-up limit (for late/not-yet-listed restocks). Auto-stops after 24h as a safety net.
                  </span>
                </label>
              </div>
            </div>
            {taskFormError && <p style={{ color: 'var(--pr-status-gone)', fontSize: 12.5, marginTop: 12 }}>{taskFormError}</p>}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <CtaButton variant="solid" size="sm" onClick={handleSaveTask} disabled={savingTask}>
                {savingTask ? 'SAVING…' : 'SAVE'}
              </CtaButton>
              <CtaButton variant="ghost" size="sm" onClick={() => setShowTaskForm(false)}>CANCEL</CtaButton>
            </div>
          </div>
        )}

        {!tasksLoading && tasks.length === 0 && (
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>No tasks yet.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((task) => {
            const effectiveStatus = liveStatus[task.id] ?? task.status
            const isRunning =
              effectiveStatus === 'running' || effectiveStatus === 'grabbed' || effectiveStatus === 'awaiting_payment'
            return (
              <div key={task.id} style={rowStyle}>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    padding: '4px 8px',
                    border: `1px solid ${STATUS_COLOR[effectiveStatus]}`,
                    color: STATUS_COLOR[effectiveStatus],
                    flexShrink: 0,
                  }}
                >
                  {effectiveStatus}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--pr-text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.mode === 'link' ? task.url : `Keywords: ${(task.keywords ?? []).join(', ')}`}
                  </h3>
                  <p style={{ color: 'var(--pr-text-dim)', fontSize: 11 }}>
                    {task.mode === 'link' ? 'Mode A · watch URL' : 'Mode B · keyword search'} · qty {task.desired_qty}
                    {task.respect_limit ? ' · respects limit' : ''}
                    {task.max_price != null ? ` · ≤ ${task.max_price} RON` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {triggerMsg[task.id] && (
                    <span style={{ color: 'var(--pr-status-gone)', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {triggerMsg[task.id]}
                    </span>
                  )}
                  {isRunning ? (
                    <CtaButton variant="ghost" size="sm" onClick={() => handleStop(task)}>STOP</CtaButton>
                  ) : (
                    <CtaButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePlay(task)}
                      disabled={!detected}
                      title={!detected ? 'Install the Snipe extension first' : undefined}
                    >
                      PLAY
                    </CtaButton>
                  )}
                  <CtaButton variant="ghost" size="sm" onClick={() => openEditTask(task)}>EDIT</CtaButton>
                  <CtaButton variant="ghost" size="sm" onClick={() => handleDeleteTask(task)}>DELETE</CtaButton>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
