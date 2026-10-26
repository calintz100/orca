import { ipcRenderer } from 'electron'
import type {
  FlowLogChangedEvent,
  FlowPaneSummary,
  FlowRemoteTurnEvent,
  FlowTurn
} from '../../shared/flow-log-types'
import type { PreloadApi } from '../api-types'

export const flowLogApi = {
  getPanes: (): Promise<FlowPaneSummary[]> => ipcRenderer.invoke('flowLog:getPanes'),
  getPaneTurns: (paneKey: string): Promise<FlowTurn[]> =>
    ipcRenderer.invoke('flowLog:getPaneTurns', paneKey),
  getDay: (date: string): Promise<FlowTurn[]> => ipcRenderer.invoke('flowLog:getDay', date),
  onChanged: (callback: (event: FlowLogChangedEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: FlowLogChangedEvent): void =>
      callback(event)
    ipcRenderer.on('flowLog:changed', listener)
    return () => ipcRenderer.removeListener('flowLog:changed', listener)
  },
  recordRemoteTurnEvent: (event: FlowRemoteTurnEvent): void =>
    ipcRenderer.send('flowLog:remoteTurnEvent', event)
} satisfies PreloadApi['flowLog']
