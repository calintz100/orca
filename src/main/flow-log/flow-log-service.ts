import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import {
  flowLogDateKey,
  type FlowLogChangedEvent,
  type FlowPaneSummary,
  type FlowTurn
} from '../../shared/flow-log-types'
import { readLastUserPromptFromTranscript } from '../../shared/agent-hook-listener/transcript-lines'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { writeFileDurable } from '../durable-file-write'
import { clipText, fallbackSummary, summarizeFlowTurn } from './flow-log-summarizer'
import { parseFlowDayFile, type FlowDayLine } from './flow-log-day-file'
import { FlowOpenTurns, type OpenTurn } from './flow-log-open-turns'
import { parseFlowRemoteTurnEvent } from './flow-log-remote-turn-event'

const RECENT_TURNS_PER_PANE = 60
const RECENT_DAYS_LOADED = 3

type HookSource = {
  subscribeEnrichedStatus(listener: (payload: EnrichedAgentHookEventPayload) => void): () => void
}

class FlowLogService {
  private readonly dir = join(getProfileUserDataPath(), 'flow-log')
  private readonly panesFile = join(this.dir, 'panes.json')
  private panes = new Map<string, FlowPaneSummary>()
  private recentTurns = new Map<string, FlowTurn[]>()
  private summaryQueue: Promise<void> = Promise.resolve()
  private loaded: Promise<void>
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly resolvers: CommitMessageAgentEnvironmentResolvers | undefined) {
    this.loaded = this.load()
  }

  // ---- persistence -----------------------------------------------------------------

  private async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    try {
      const raw = JSON.parse(await readFile(this.panesFile, 'utf8')) as Record<
        string,
        FlowPaneSummary
      >
      for (const [key, pane] of Object.entries(raw)) {
        this.panes.set(key, { ...pane, summarizing: false })
      }
    } catch {
      // First run or unreadable file: start empty.
    }
    const now = Date.now()
    for (let i = RECENT_DAYS_LOADED - 1; i >= 0; i--) {
      for (const turn of await this.readDay(flowLogDateKey(now - i * 86_400_000))) {
        this.rememberTurn(turn)
      }
    }
  }

  private scheduleSavePanes(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      const obj = Object.fromEntries(this.panes)
      void writeFileDurable(`${this.panesFile}.tmp`, this.panesFile, JSON.stringify(obj)).catch(
        (error) => console.error('[flow-log] saving panes failed', error)
      )
    }, 500)
  }

  private async appendDayLine(ts: number, line: FlowDayLine): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await appendFile(
      join(this.dir, `${flowLogDateKey(ts)}.jsonl`),
      `${JSON.stringify(line)}\n`,
      'utf8'
    )
  }

  async readDay(date: string): Promise<FlowTurn[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return []
    }
    let text: string
    try {
      text = await readFile(join(this.dir, `${date}.jsonl`), 'utf8')
    } catch {
      return []
    }
    return parseFlowDayFile(text)
  }

  private rememberTurn(turn: FlowTurn): void {
    const list = this.recentTurns.get(turn.paneKey) ?? []
    const i = list.findIndex((t) => t.id === turn.id)
    if (i !== -1) {
      list[i] = turn
    } else {
      list.push(turn)
    }
    this.recentTurns.set(turn.paneKey, list.slice(-RECENT_TURNS_PER_PANE))
  }

  // ---- queries -----------------------------------------------------------------------

  async getPanes(): Promise<FlowPaneSummary[]> {
    await this.loaded
    return [...this.panes.values()]
  }

  async getPaneTurns(paneKey: string): Promise<FlowTurn[]> {
    await this.loaded
    return this.recentTurns.get(paneKey) ?? []
  }

  // ---- finished turns ----------------------------------------------------------------

  private fullPrompt(open: OpenTurn): string {
    const fromTranscript = readLastUserPromptFromTranscript(open.transcriptPath)
    const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
    if (fromTranscript && norm(fromTranscript).startsWith(norm(open.prompt).slice(0, 30))) {
      return fromTranscript
    }
    return open.prompt
  }

  async finishTurn(paneKey: string, open: OpenTurn): Promise<void> {
    await this.loaded
    const prompt = clipText(this.fullPrompt(open), 4000)
    const assistant = clipText(open.assistant, 4000)
    const prevPane = this.panes.get(paneKey)
    const prev = { title: prevPane?.title ?? '', steps: prevPane?.steps ?? [] }
    const quick = fallbackSummary({ prompt, assistant }, prev)
    const turn: FlowTurn = {
      id: randomUUID(),
      paneKey,
      tabId: open.tabId,
      worktreeId: open.worktreeId,
      agentType: open.agentType,
      sessionId: open.sessionId,
      prompt,
      assistant,
      tools: open.tools,
      startedAt: open.startedAt,
      endedAt: open.endedAt,
      question: quick.question,
      result: quick.result,
      summarized: false
    }
    this.rememberTurn(turn)
    this.panes.set(paneKey, {
      paneKey,
      tabId: open.tabId ?? prevPane?.tabId,
      worktreeId: open.worktreeId ?? prevPane?.worktreeId,
      agentType: open.agentType ?? prevPane?.agentType,
      title: prev.title || quick.title,
      steps: prev.steps,
      lastQuestion: quick.question,
      lastResult: quick.result,
      turnCount: (prevPane?.turnCount ?? 0) + 1,
      updatedAt: turn.endedAt,
      summarizing: true
    })
    this.scheduleSavePanes()
    await this.appendDayLine(turn.startedAt, { kind: 'turn', turn }).catch((error) =>
      console.error('[flow-log] append failed', error)
    )
    this.notify(paneKey, turn.startedAt)
    this.summaryQueue = this.summaryQueue.then(() => this.summarize(turn))
  }

  private async summarize(turn: FlowTurn): Promise<void> {
    const pane = this.panes.get(turn.paneKey)
    const prev = { title: pane?.title ?? '', steps: pane?.steps ?? [] }
    const summary = await summarizeFlowTurn(turn, prev, this.resolvers)
    const updated: FlowTurn = {
      ...turn,
      question: summary.question,
      result: summary.result,
      summarized: true
    }
    this.rememberTurn(updated)
    const current = this.panes.get(turn.paneKey)
    if (current) {
      this.panes.set(turn.paneKey, {
        ...current,
        title: summary.title || current.title,
        steps: summary.steps.length ? summary.steps : current.steps,
        lastQuestion: summary.question,
        lastResult: summary.result,
        summarizing: false
      })
      this.scheduleSavePanes()
    }
    await this.appendDayLine(turn.startedAt, {
      kind: 'summary',
      id: turn.id,
      question: summary.question,
      result: summary.result
    }).catch((error) => console.error('[flow-log] append failed', error))
    this.notify(turn.paneKey, turn.startedAt)
  }

  notify(paneKey: string, ts: number): void {
    const event: FlowLogChangedEvent = { paneKey, date: flowLogDateKey(ts) }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('flowLog:changed', event)
      }
    }
  }
}

let service: FlowLogService | null = null

/** Starts the flow log once per process and registers its IPC handlers. */
export function startFlowLog(
  hookSource: HookSource,
  resolvers: CommitMessageAgentEnvironmentResolvers | undefined
): void {
  if (service) {
    return
  }
  const instance = new FlowLogService(resolvers)
  service = instance
  const turns = new FlowOpenTurns(
    (paneKey, at) => instance.notify(paneKey, at),
    (paneKey, turn) => void instance.finishTurn(paneKey, turn)
  )
  hookSource.subscribeEnrichedStatus((event) => {
    try {
      turns.handleHookEvent(event)
    } catch (error) {
      console.error('[flow-log] event handling failed', error)
    }
  })
  ipcMain.handle('flowLog:getPanes', () => instance.getPanes())
  ipcMain.handle('flowLog:getPaneTurns', (_event, paneKey: unknown) =>
    typeof paneKey === 'string' ? instance.getPaneTurns(paneKey) : []
  )
  ipcMain.handle('flowLog:getDay', (_event, date: unknown) =>
    typeof date === 'string' ? instance.readDay(date) : []
  )
  ipcMain.on('flowLog:remoteTurnEvent', (_event, raw: unknown) => {
    const event = parseFlowRemoteTurnEvent(raw)
    if (event) {
      turns.handleRemoteEvent(event)
    }
  })
}
