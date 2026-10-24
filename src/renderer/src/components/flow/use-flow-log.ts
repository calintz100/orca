import { useEffect, useState, useSyncExternalStore } from 'react'
import type { FlowPaneSummary, FlowTurn } from '../../../../shared/flow-log-types'

// One shared copy of the pane summaries for every bar, card and board on screen: a single IPC
// load plus one change subscription, instead of one per pane.
const EMPTY = new Map<string, FlowPaneSummary>()
let summaries: Map<string, FlowPaneSummary> = EMPTY
const listeners = new Set<() => void>()
let unsubscribeMain: (() => void) | null = null

function loadSummaries(): void {
  void window.api.flowLog.getPanes().then((list) => {
    summaries = new Map(list.map((p) => [p.paneKey, p]))
    for (const listener of listeners) {
      listener()
    }
  })
}

function subscribeSummaries(listener: () => void): () => void {
  listeners.add(listener)
  if (!unsubscribeMain) {
    unsubscribeMain = window.api.flowLog.onChanged(loadSummaries)
    loadSummaries()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && unsubscribeMain) {
      unsubscribeMain()
      unsubscribeMain = null
    }
  }
}

/** All pane summaries; refreshes whenever main reports a change. */
export function useFlowPaneSummaries(): Map<string, FlowPaneSummary> {
  return useSyncExternalStore(subscribeSummaries, () => summaries)
}

/** One pane's running summary (title, steps, last question → result). */
export function useFlowPaneSummary(paneKey: string | null): FlowPaneSummary | undefined {
  return useSyncExternalStore(subscribeSummaries, () =>
    paneKey ? summaries.get(paneKey) : undefined
  )
}

/** Recent finished turns of one pane (oldest first), refreshed on change. */
export function useFlowPaneTurns(paneKey: string | null): FlowTurn[] {
  const [turns, setTurns] = useState<FlowTurn[]>([])
  useEffect(() => {
    if (!paneKey) {
      setTurns([])
      return
    }
    let alive = true
    const load = (): void => {
      void window.api.flowLog.getPaneTurns(paneKey).then((list) => {
        if (alive) {
          setTurns(list)
        }
      })
    }
    load()
    const off = window.api.flowLog.onChanged((event) => {
      if (event.paneKey === paneKey) {
        load()
      }
    })
    return () => {
      alive = false
      off()
    }
  }, [paneKey])
  return turns
}

/** All turns of one local day (oldest first), refreshed when that day changes. */
export function useFlowDay(date: string): { turns: FlowTurn[]; loading: boolean } {
  const [turns, setTurns] = useState<FlowTurn[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const load = (): void => {
      void window.api.flowLog.getDay(date).then((list) => {
        if (alive) {
          setTurns(list)
          setLoading(false)
        }
      })
    }
    setLoading(true)
    load()
    const off = window.api.flowLog.onChanged((event) => {
      if (event.date === date) {
        load()
      }
    })
    return () => {
      alive = false
      off()
    }
  }, [date])
  return { turns, loading }
}

export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) {
    return `${s}s`
  }
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}
