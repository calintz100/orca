/**
 * Flow log: per agent pane, a day-by-day record of what was asked and how it was handled,
 * plus a short running summary (title + steps). Lets a user who juggles many agents see at a
 * glance what each pane was doing. Written by main (src/main/flow-log), read by the Flow panel
 * and the Today's flow board.
 */

export type FlowStepStatus = 'done' | 'doing' | 'todo'

export type FlowStep = {
  label: string
  status: FlowStepStatus
}

/** One finished turn: the user's prompt and how the agent answered it. */
export type FlowTurn = {
  id: string
  paneKey: string
  tabId?: string
  worktreeId?: string
  agentType?: string
  sessionId?: string
  /** Full prompt when the transcript had it, else the (trimmed) hook prompt. */
  prompt: string
  /** Last assistant prose of the turn, clipped. */
  assistant: string
  tools: string[]
  startedAt: number
  endedAt: number
  /** One-line summaries; raw-text fallback until (or instead of) the model summary. */
  question: string
  result: string
  summarized: boolean
}

/** The running state of a pane's task. */
export type FlowPaneSummary = {
  paneKey: string
  tabId?: string
  worktreeId?: string
  agentType?: string
  title: string
  steps: FlowStep[]
  lastQuestion: string
  lastResult: string
  turnCount: number
  updatedAt: number
  summarizing: boolean
}

export type FlowLogSnapshot = {
  panes: FlowPaneSummary[]
}

export type FlowLogChangedEvent = {
  paneKey: string
  /** Local date (YYYY-MM-DD) of the day file that changed. */
  date: string
}

export function flowLogDateKey(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
