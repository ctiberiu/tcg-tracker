import { useState } from 'react'
import { AppSidebar } from '../components/AppSidebar'
import { useSnipeFlows } from '../hooks/useSnipeFlows'
import { useSnipeTasks } from '../hooks/useSnipeTasks'
import { useExtensionDetected } from '../hooks/useExtensionDetected'
import { useSnipeTrigger } from '../hooks/useSnipeTrigger'
import { InstallExtensionModal, EXTENSION_ZIP_URL } from '../components/InstallExtensionModal'
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

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'block text-on-surface-variant text-xs uppercase tracking-wider mb-1'

const STATUS_STYLES: Record<SnipeTaskStatus, string> = {
  idle: 'bg-surface-container text-on-surface-variant',
  running: 'bg-primary/10 text-primary',
  grabbed: 'bg-primary/10 text-primary',
  awaiting_payment: 'bg-tertiary/10 text-tertiary',
  ordered: 'bg-tertiary/10 text-tertiary',
  failed: 'bg-error/10 text-error',
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
    <div className="min-h-screen bg-background flex">
      <AppSidebar activePage="snipe" />

      <div className="flex-1 p-8 overflow-auto">
        <h1 className="font-headline font-black text-xl text-on-surface uppercase tracking-tight mb-8">
          TCG Tracker
        </h1>

        {/* Extension status banner */}
        <div
          className={`p-3 rounded-lg text-sm mb-8 flex items-center gap-2 ${
            checking
              ? 'bg-surface-container text-on-surface-variant'
              : detected
                ? 'bg-tertiary/10 text-tertiary'
                : 'bg-error/10 text-error'
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${detected ? 'bg-tertiary' : checking ? 'bg-outline' : 'bg-error'}`} />
          {checking
            ? 'Checking for the Snipe extension…'
            : detected
              ? 'Snipe extension detected.'
              : 'Snipe extension not installed — install it to run tasks.'}
        </div>

        {/* Get the extension */}
        <div className="flex items-center gap-3 mb-8">
          <a
            href={EXTENSION_ZIP_URL}
            download="snipe-extension.zip"
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            Download extension
          </a>
          <button
            onClick={() => setShowInstall(true)}
            className="px-4 py-2 rounded-lg bg-surface-high text-on-surface font-headline font-bold text-sm hover:bg-surface-highest transition-colors"
          >
            How to install
          </button>
        </div>

        <InstallExtensionModal open={showInstall} onClose={() => setShowInstall(false)} />

        {/* ── Flows ── */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-2xl font-bold text-on-surface">Flows</h2>
          <button
            onClick={openAddFlow}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            + Add Flow
          </button>
        </div>

        {flowsError && (
          <div className="p-3 rounded-lg bg-error/10 text-error text-sm mb-4">Failed to load flows: {flowsError}</div>
        )}
        {flowsLoading && <p className="text-on-surface-variant text-sm">Loading flows…</p>}

        {showFlowForm && (
          <div className="bg-surface-low rounded-xl p-6 mb-6">
            <h3 className="font-headline font-bold text-on-surface mb-4">{editingFlowId ? 'Edit Flow' : 'Add Flow'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Site</label>
                <input type="text" value={flowForm.site} disabled className={`${inputClass} opacity-60`} />
              </div>
              <div>
                <label className={labelClass}>Payment Method</label>
                <select
                  value={flowForm.payment_method}
                  onChange={(e) => setFlowForm({ ...flowForm, payment_method: e.target.value as FlowFormData['payment_method'] })}
                  className={inputClass}
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Shipping Method (optional)</label>
                <input
                  type="text"
                  value={flowForm.shipping_method}
                  onChange={(e) => setFlowForm({ ...flowForm, shipping_method: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Curier / Easybox"
                />
              </div>
              <div>
                <label className={labelClass}>Address (optional — blank = account default)</label>
                <input
                  type="text"
                  value={flowForm.address}
                  onChange={(e) => setFlowForm({ ...flowForm, address: e.target.value })}
                  className={inputClass}
                  placeholder="Saved address label"
                />
              </div>
            </div>
            {flowFormError && <p className="text-error text-sm mt-3">{flowFormError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveFlow}
                disabled={savingFlow}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingFlow ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShowFlowForm(false)}
                className="px-4 py-2 rounded-lg bg-surface-high text-on-surface font-headline text-sm hover:bg-surface-highest transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!flowsLoading && flows.length === 0 && (
          <p className="text-on-surface-variant text-sm mb-8">No flows yet. Add one to configure checkout.</p>
        )}
        <div className="space-y-3 mb-10">
          {flows.map((flow) => (
            <div key={flow.id} className="bg-surface-low rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-headline font-bold text-on-surface text-sm">{flowLabel(flow)}</h3>
                <p className="text-on-surface-variant text-xs">
                  {flow.address ? `Address: ${flow.address}` : 'Address: account default'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEditFlow(flow)}
                  className="px-3 py-1.5 rounded-lg bg-surface-high text-on-surface text-xs font-bold hover:bg-surface-highest transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteFlow(flow)}
                  className="px-3 py-1.5 rounded-lg bg-surface-high text-on-surface text-xs font-bold hover:bg-surface-highest hover:text-error transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tasks ── */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-2xl font-bold text-on-surface">Tasks</h2>
          <button
            onClick={openAddTask}
            disabled={flows.length === 0}
            title={flows.length === 0 ? 'Add a flow first' : undefined}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            + Add Task
          </button>
        </div>

        {tasksError && (
          <div className="p-3 rounded-lg bg-error/10 text-error text-sm mb-4">Failed to load tasks: {tasksError}</div>
        )}
        {tasksLoading && <p className="text-on-surface-variant text-sm">Loading tasks…</p>}

        {showTaskForm && (
          <div className="bg-surface-low rounded-xl p-6 mb-6">
            <h3 className="font-headline font-bold text-on-surface mb-4">{editingTaskId ? 'Edit Task' : 'Add Task'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Flow</label>
                <select
                  value={taskForm.flow_id}
                  onChange={(e) => setTaskForm({ ...taskForm, flow_id: e.target.value })}
                  className={inputClass}
                >
                  {flows.map((flow) => (
                    <option key={flow.id} value={flow.id}>{flowLabel(flow)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Mode</label>
                <select
                  value={taskForm.mode}
                  onChange={(e) => setTaskForm({ ...taskForm, mode: e.target.value as TaskFormData['mode'] })}
                  className={inputClass}
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              {taskForm.mode === 'link' ? (
                <div className="md:col-span-2">
                  <label className={labelClass}>Product URL (Mode A)</label>
                  <input
                    type="url"
                    value={taskForm.url}
                    onChange={(e) => setTaskForm({ ...taskForm, url: e.target.value })}
                    className={inputClass}
                    placeholder="https://krit.ro/produs/…"
                  />
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className={labelClass}>Keywords (comma-separated, Mode B)</label>
                  <input
                    type="text"
                    value={taskForm.keywords}
                    onChange={(e) => setTaskForm({ ...taskForm, keywords: e.target.value })}
                    className={inputClass}
                    placeholder="pokemon, prismatic, elite"
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Desired Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={taskForm.desired_qty}
                  onChange={(e) => setTaskForm({ ...taskForm, desired_qty: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Max Price (optional, RON)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={taskForm.max_price}
                  onChange={(e) => setTaskForm({ ...taskForm, max_price: e.target.value })}
                  className={inputClass}
                  placeholder="No cap"
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <input
                  type="checkbox"
                  id="respect_limit"
                  checked={taskForm.respect_limit}
                  onChange={(e) => setTaskForm({ ...taskForm, respect_limit: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="respect_limit" className="text-on-surface text-sm">Respect per-person limit</label>
              </div>
              <div className="flex items-start gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  id="watch_until_stopped"
                  checked={taskForm.watch_until_stopped}
                  onChange={(e) => setTaskForm({ ...taskForm, watch_until_stopped: e.target.checked })}
                  className="w-4 h-4 accent-primary mt-0.5"
                />
                <label htmlFor="watch_until_stopped" className="text-on-surface text-sm">
                  Keep checking until I stop it
                  <span className="block text-on-surface-variant text-xs">
                    Ignores the normal error give-up limit (for late/not-yet-listed restocks). Auto-stops after 24h as a safety net.
                  </span>
                </label>
              </div>
            </div>
            {taskFormError && <p className="text-error text-sm mt-3">{taskFormError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveTask}
                disabled={savingTask}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingTask ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShowTaskForm(false)}
                className="px-4 py-2 rounded-lg bg-surface-high text-on-surface font-headline text-sm hover:bg-surface-highest transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!tasksLoading && tasks.length === 0 && (
          <p className="text-on-surface-variant text-sm">No tasks yet.</p>
        )}
        <div className="space-y-3">
          {tasks.map((task) => {
            const effectiveStatus = liveStatus[task.id] ?? task.status
            const isRunning =
              effectiveStatus === 'running' || effectiveStatus === 'grabbed' || effectiveStatus === 'awaiting_payment'
            return (
              <div key={task.id} className="bg-surface-low rounded-xl p-4 flex items-center gap-4">
                <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${STATUS_STYLES[effectiveStatus]}`}>
                  {effectiveStatus}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-headline font-bold text-on-surface text-sm truncate">
                    {task.mode === 'link' ? task.url : `Keywords: ${(task.keywords ?? []).join(', ')}`}
                  </h3>
                  <p className="text-on-surface-variant text-xs">
                    {task.mode === 'link' ? 'Mode A · watch URL' : 'Mode B · keyword search'} · qty {task.desired_qty}
                    {task.respect_limit ? ' · respects limit' : ''}
                    {task.max_price != null ? ` · ≤ ${task.max_price} RON` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {triggerMsg[task.id] && <span className="text-error text-xs max-w-[180px] truncate">{triggerMsg[task.id]}</span>}
                  {isRunning ? (
                    <button
                      onClick={() => handleStop(task)}
                      className="px-3 py-1.5 rounded-lg bg-error/10 text-error text-xs font-bold hover:bg-error/20 transition-colors"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlay(task)}
                      disabled={!detected}
                      title={!detected ? 'Install the Snipe extension first' : undefined}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      Play
                    </button>
                  )}
                  <button
                    onClick={() => openEditTask(task)}
                    className="px-3 py-1.5 rounded-lg bg-surface-high text-on-surface text-xs font-bold hover:bg-surface-highest transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task)}
                    className="px-3 py-1.5 rounded-lg bg-surface-high text-on-surface text-xs font-bold hover:bg-surface-highest hover:text-error transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
