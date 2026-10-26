import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { createRemoteFlowTurnTracker } from './remote-flow-turn-tracker'

/** Forwards remote-host panes' turns to main's flow log, which only hears local hooks. */
export function useRemoteFlowTurnForwarding(): void {
  useEffect(() => {
    const record = window.api.flowLog?.recordRemoteTurnEvent
    if (typeof record !== 'function') {
      return
    }
    const tracker = createRemoteFlowTurnTracker()
    const forward = (entries: ReturnType<typeof useAppStore.getState>['agentStatusByPaneKey']) => {
      for (const event of tracker.takeEvents(entries, Date.now())) {
        record(event)
      }
    }
    forward(useAppStore.getState().agentStatusByPaneKey)
    return useAppStore.subscribe((state, previous) => {
      if (state.agentStatusByPaneKey !== previous.agentStatusByPaneKey) {
        forward(state.agentStatusByPaneKey)
      }
    })
  }, [])
}
