/**
 * Turns the live status of remote-host panes into flow-log turn steps. A pane served by a remote
 * orcad sends its agent hooks to that host's hook server, so main's flow log never sees them;
 * the renderer still gets the pane's status rows and forwards what they show.
 */
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { FlowRemoteTurnEvent } from '../../../../shared/flow-log-types'

type PaneTrack = { turnKey: string; tool?: string; ended: boolean }

function isActive(state: AgentStatusEntry['state']): boolean {
  return state === 'working' || state === 'waiting' || state === 'blocked'
}

function isRemote(entry: AgentStatusEntry): boolean {
  return entry.connectionId != null && !entry.structuredHostOwned
}

function turnAssistant(entry: AgentStatusEntry): string {
  const live = entry.lastAssistantMessageIsToolOutput ? undefined : entry.lastAssistantMessage
  return live || entry.lastCompletedAssistantMessage || ''
}

export type RemoteFlowTurnTracker = {
  /** The turn steps these rows add since the previous call. */
  takeEvents: (entries: Record<string, AgentStatusEntry>, now: number) => FlowRemoteTurnEvent[]
}

export function createRemoteFlowTurnTracker(): RemoteFlowTurnTracker {
  const tracks = new Map<string, PaneTrack>()

  function readEntry(
    paneKey: string,
    entry: AgentStatusEntry,
    now: number,
    out: FlowRemoteTurnEvent[]
  ): void {
    let track = tracks.get(paneKey)
    // Why turnStartedAt: the same prompt typed twice is still two turns.
    const turnKey = entry.prompt ? `${entry.turnStartedAt ?? ''}|${entry.prompt}` : ''
    if (isActive(entry.state) && turnKey && (!track || track.ended || track.turnKey !== turnKey)) {
      // A batched done -> working can hide the previous turn's end.
      if (track && !track.ended) {
        out.push({
          kind: 'done',
          paneKey,
          assistant: entry.lastCompletedAssistantMessage ?? '',
          at: now
        })
      }
      out.push({
        kind: 'prompt',
        paneKey,
        prompt: entry.prompt,
        at: entry.turnStartedAt ?? entry.stateStartedAt ?? now,
        tabId: entry.tabId,
        worktreeId: entry.worktreeId,
        agentType: entry.agentType
      })
      track = { turnKey, ended: false }
      tracks.set(paneKey, track)
    }
    if (!track || track.ended) {
      return
    }
    if (isActive(entry.state) && entry.toolName && entry.toolName !== track.tool) {
      track.tool = entry.toolName
      out.push({ kind: 'tool', paneKey, toolName: entry.toolName, at: now })
    }
    if (entry.state === 'done' && !entry.sessionBoundary) {
      track.ended = true
      out.push({
        kind: 'done',
        paneKey,
        assistant: turnAssistant(entry),
        at: entry.turnEndedAt ?? now
      })
    }
  }

  return {
    takeEvents(entries, now) {
      const out: FlowRemoteTurnEvent[] = []
      // Deleting the current key while iterating a Map is safe.
      for (const paneKey of tracks.keys()) {
        const entry = entries[paneKey]
        if (!entry || !isRemote(entry)) {
          tracks.delete(paneKey)
        }
      }
      for (const [paneKey, entry] of Object.entries(entries)) {
        if (isRemote(entry)) {
          readEntry(paneKey, entry, now, out)
        }
      }
      return out
    }
  }
}
