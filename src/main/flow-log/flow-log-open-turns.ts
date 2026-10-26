/**
 * The turn each pane is in, from its first prompt to the `done` that ends it. Fed by this
 * desktop's hook events and by remote-host panes' steps the renderer forwards; hands each
 * finished turn to the flow log.
 */
import type { FlowRemoteTurnEvent } from '../../shared/flow-log-types'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import { clipText } from './flow-log-summarizer'

/** The assistant message can arrive in a second `done` emission (transcript flush retry). */
const TURN_CLOSE_DEBOUNCE_MS = 2500
const MAX_TOOLS_PER_TURN = 60

export type OpenTurn = {
  prompt: string
  startedAt: number
  tools: string[]
  tabId?: string
  worktreeId?: string
  agentType?: string
  sessionId?: string
  transcriptPath?: string
  assistant: string
  endedAt: number
  closeTimer: ReturnType<typeof setTimeout> | null
}

type TurnStart = Pick<
  OpenTurn,
  'prompt' | 'startedAt' | 'tabId' | 'worktreeId' | 'agentType' | 'sessionId' | 'transcriptPath'
>

export class FlowOpenTurns {
  private openTurns = new Map<string, OpenTurn>()
  private localPanes = new Set<string>()

  constructor(
    private readonly onStarted: (paneKey: string, at: number) => void,
    private readonly onFinished: (paneKey: string, turn: OpenTurn) => void
  ) {}

  handleHookEvent(event: EnrichedAgentHookEventPayload): void {
    if (
      event.isReplay ||
      event.providerSessionOnly ||
      event.restoredUnconfirmed ||
      event.structuredHost ||
      event.programStatusOnly ||
      // Subagent rows never describe the lead agent's turn.
      event.toolAgentId
    ) {
      return
    }
    const { paneKey, payload } = event
    this.localPanes.add(paneKey)
    if (event.hookEventName === 'UserPromptSubmit' && payload.prompt) {
      this.start(paneKey, {
        prompt: payload.prompt,
        startedAt: event.receivedAt,
        tabId: event.tabId,
        worktreeId: event.worktreeId,
        agentType: payload.agentType,
        sessionId: event.providerSession?.id,
        transcriptPath: event.providerSession?.transcriptPath
      })
      return
    }
    const open = this.openTurns.get(paneKey)
    if (open && event.providerSession?.transcriptPath) {
      open.transcriptPath = event.providerSession.transcriptPath
    }
    if (event.hookEventName === 'PreToolUse' && payload.toolName) {
      this.noteTool(paneKey, payload.toolName)
    }
    if (payload.state === 'done' && !payload.sessionBoundary) {
      const assistant = payload.lastAssistantMessageIsToolOutput
        ? undefined
        : payload.lastAssistantMessage
      this.end(paneKey, assistant, event.receivedAt)
    }
  }

  /** A remote-host pane's turn step, forwarded by the renderer from its live status. */
  handleRemoteEvent(event: FlowRemoteTurnEvent): void {
    // Why: a pane this desktop's own hooks describe would otherwise be recorded twice.
    if (this.localPanes.has(event.paneKey)) {
      return
    }
    if (event.kind === 'prompt') {
      this.start(event.paneKey, {
        prompt: event.prompt,
        startedAt: event.at,
        tabId: event.tabId,
        worktreeId: event.worktreeId,
        agentType: event.agentType
      })
    } else if (event.kind === 'tool') {
      this.noteTool(event.paneKey, event.toolName)
    } else {
      this.end(event.paneKey, event.assistant, event.at)
    }
  }

  private start(paneKey: string, turn: TurnStart): void {
    this.closeNow(paneKey)
    this.openTurns.set(paneKey, {
      ...turn,
      tools: [],
      assistant: '',
      endedAt: turn.startedAt,
      closeTimer: null
    })
    this.onStarted(paneKey, turn.startedAt)
  }

  private noteTool(paneKey: string, toolName: string): void {
    const open = this.openTurns.get(paneKey)
    if (!open) {
      return
    }
    const label = clipText(toolName, 80)
    if (open.tools.at(-1) !== label && open.tools.length < MAX_TOOLS_PER_TURN) {
      open.tools.push(label)
    }
  }

  private end(paneKey: string, assistant: string | undefined, at: number): void {
    const open = this.openTurns.get(paneKey)
    if (!open) {
      return
    }
    if (assistant) {
      open.assistant = assistant
    }
    open.endedAt = at
    if (open.closeTimer) {
      clearTimeout(open.closeTimer)
    }
    open.closeTimer = setTimeout(() => this.closeNow(paneKey), TURN_CLOSE_DEBOUNCE_MS)
  }

  /** Closes a pane's turn if it already ended (a `done` was seen). */
  private closeNow(paneKey: string): void {
    const open = this.openTurns.get(paneKey)
    if (!open || !open.closeTimer) {
      return
    }
    clearTimeout(open.closeTimer)
    this.openTurns.delete(paneKey)
    this.onFinished(paneKey, open)
  }
}
