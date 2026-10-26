import type {
  FlowLogChangedEvent,
  FlowPaneSummary,
  FlowRemoteTurnEvent,
  FlowTurn
} from '../../shared/flow-log-types'

export type FlowLogApi = {
  getPanes: () => Promise<FlowPaneSummary[]>
  getPaneTurns: (paneKey: string) => Promise<FlowTurn[]>
  getDay: (date: string) => Promise<FlowTurn[]>
  onChanged: (callback: (event: FlowLogChangedEvent) => void) => () => void
  recordRemoteTurnEvent: (event: FlowRemoteTurnEvent) => void
}
