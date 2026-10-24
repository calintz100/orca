import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, SquareArrowOutUpRight, Waypoints } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AgentStateDot } from '@/components/AgentStateDot'
import { agentRowDotState } from '@/lib/agent-row-dot-state'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  flowLogDateKey,
  type FlowPaneSummary,
  type FlowTurn
} from '../../../../shared/flow-log-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { FlowStepList } from './FlowStepList'
import { formatClock, formatDuration, useFlowDay, useFlowPaneSummaries } from './use-flow-log'

type Lane = {
  paneKey: string
  tabId?: string
  worktreeId?: string
  title: string
  workspace: string
  open: boolean
  summary?: FlowPaneSummary
  turns: FlowTurn[]
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return flowLogDateKey(new Date(y, m - 1, d + days).getTime())
}

/** Focus the pane a lane belongs to (leaves this page for the terminal). */
function focusPane(lane: Lane): void {
  if (!lane.worktreeId || !lane.tabId) {
    return
  }
  if (
    activateAndRevealWorkspace(lane.worktreeId, {
      revealInSidebar: false,
      clearSidebarFilters: false
    }) === false
  ) {
    return
  }
  const state = useAppStore.getState()
  if (!(state.tabsByWorktree[lane.worktreeId] ?? []).some((tab) => tab.id === lane.tabId)) {
    return
  }
  state.setActiveTabType('terminal', lane.worktreeId)
  const parsed = parsePaneKey(lane.paneKey)
  activateTabAndFocusPane(lane.tabId, parsed?.leafId ?? null, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
}

function LaneColumn({ lane }: { lane: Lane }): React.JSX.Element {
  const entry = useAppStore((s) => (lane.open ? s.agentStatusByPaneKey[lane.paneKey] : undefined))
  const working =
    entry && (entry.state === 'working' || entry.state === 'waiting' || entry.state === 'blocked')
  const last = lane.turns.at(-1)
  const newestFirst = lane.turns.map((turn, i) => ({ turn, n: i + 1 })).toReversed()

  return (
    <section className="relative flex h-full min-h-0 w-[320px] shrink-0 flex-col overflow-hidden rounded-md border border-t-2 border-worktree-sidebar-border bg-background">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {entry ? (
            <AgentStateDot state={agentRowDotState(entry.state, entry.workingMode)} size="sm" />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" title={lane.title}>
            {lane.title}
          </span>
          {lane.summary?.summarizing && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {translate('auto.components.flow.FlowPanel.summarizing', 'Summarizing…')}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate">{lane.workspace}</span>
          {lane.turns.length > 0 && (
            <span className="shrink-0 tabular-nums">
              · {formatClock(lane.turns[0].startedAt)}–{formatClock(last?.endedAt ?? 0)} ·{' '}
              {translate('auto.components.flow.FlowPanel.turnCount', '{{value0}} questions', {
                value0: lane.turns.length
              })}
            </span>
          )}
        </div>
      </div>

      <div
        className={cn(
          'mx-3 mt-2.5 rounded-md border px-2.5 py-2',
          working ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/30'
        )}
      >
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {working
            ? translate('auto.components.flow.FlowPanel.now', 'Doing now')
            : translate('auto.components.flow.FlowBoardPage.lastDone', 'Last done')}
        </div>
        {working ? (
          <>
            <div className="line-clamp-3 text-xs font-medium leading-snug">{entry?.prompt}</div>
            {entry?.toolName && (
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {entry.toolName}
              </div>
            )}
          </>
        ) : last ? (
          <>
            <div className="line-clamp-2 text-xs font-medium leading-snug">{last.question}</div>
            <div className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-foreground/75">
              → {last.result || '—'}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            {translate('auto.components.flow.FlowBoardPage.noQuestions', 'No questions yet.')}
          </div>
        )}
      </div>

      {!!lane.summary?.steps.length && (
        <div className="px-3 pt-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {translate('auto.components.flow.FlowPanel.steps', 'Steps')}
          </div>
          <FlowStepList steps={lane.summary.steps} />
        </div>
      )}

      {newestFirst.length > 0 && (
        <>
          <div className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {translate('auto.components.flow.FlowPanel.history', 'Questions')}
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2 scrollbar-sleek">
            {newestFirst.map(({ turn, n }) => (
              <li key={turn.id} className="group border-b border-border/60 py-1.5 last:border-b-0">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="rounded-full bg-muted px-1.5 tabular-nums">{n}</span>
                  <span className="tabular-nums">{formatClock(turn.startedAt)}</span>
                  <span>· {formatDuration(turn.endedAt - turn.startedAt)}</span>
                </div>
                <div
                  className="mt-0.5 line-clamp-2 break-words text-xs leading-snug group-hover:line-clamp-none"
                  title={turn.prompt}
                >
                  {turn.question}
                </div>
                <div className="line-clamp-3 break-words text-[11px] leading-snug text-muted-foreground group-hover:line-clamp-none">
                  → {turn.result || '—'}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {lane.open && (
        <div className="mt-auto shrink-0 border-t border-border/70 px-3 py-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => focusPane(lane)}
          >
            <SquareArrowOutUpRight className="size-3.5" />
            {translate('auto.components.flow.FlowBoardPage.goToPane', 'Go to this terminal')}
          </Button>
        </div>
      )}
    </section>
  )
}

/** Today's flow: one lane per agent pane with its own steps and questions, newest first. */
export default function FlowBoardPage(): React.JSX.Element {
  const [today] = useState(() => flowLogDateKey(Date.now()))
  const [date, setDate] = useState(today)
  const [copied, setCopied] = useState(false)
  const { turns, loading } = useFlowDay(date)
  const summaries = useFlowPaneSummaries()
  const { tabsByWorktree, agentPaneKeys, getKnownWorktreeById } = useAppStore(
    useShallow((s) => ({
      tabsByWorktree: s.tabsByWorktree,
      agentPaneKeys: Object.keys(s.agentStatusByPaneKey).join('|'),
      getKnownWorktreeById: s.getKnownWorktreeById
    }))
  )

  const lanes = useMemo<Lane[]>(() => {
    const tabInfo = new Map<string, { worktreeId: string; title: string }>()
    for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
      for (const tab of tabs) {
        tabInfo.set(tab.id, {
          worktreeId,
          title: tab.customTitle || tab.generatedTitle || tab.title || tab.defaultTitle || ''
        })
      }
    }
    const byPane = new Map<string, FlowTurn[]>()
    for (const turn of turns) {
      byPane.set(turn.paneKey, [...(byPane.get(turn.paneKey) ?? []), turn])
    }
    if (date === today) {
      for (const paneKey of agentPaneKeys ? agentPaneKeys.split('|') : []) {
        if (!byPane.has(paneKey) && tabInfo.has(parsePaneKey(paneKey)?.tabId ?? '')) {
          byPane.set(paneKey, [])
        }
      }
    }
    const result: Lane[] = []
    for (const [paneKey, paneTurns] of byPane) {
      const summary = summaries.get(paneKey)
      const tabId = parsePaneKey(paneKey)?.tabId ?? summary?.tabId ?? paneTurns[0]?.tabId
      const info = tabId ? tabInfo.get(tabId) : undefined
      const worktreeId = info?.worktreeId ?? summary?.worktreeId ?? paneTurns[0]?.worktreeId
      const worktree = worktreeId ? getKnownWorktreeById(worktreeId) : undefined
      result.push({
        paneKey,
        tabId,
        worktreeId,
        title:
          summary?.title ||
          info?.title ||
          translate('auto.components.flow.FlowPanel.untitled', 'New task'),
        workspace: worktree?.displayName ?? '',
        open: !!info,
        summary,
        turns: paneTurns
      })
    }
    const lastTs = (lane: Lane): number => lane.turns.at(-1)?.endedAt ?? 0
    return result.sort((a, b) => Number(b.open) - Number(a.open) || lastTs(b) - lastTs(a))
  }, [turns, summaries, tabsByWorktree, agentPaneKeys, getKnownWorktreeById, date, today])

  const copyMarkdown = (): void => {
    const lines = [`# ${date}`, '']
    for (const lane of lanes) {
      if (!lane.turns.length) {
        continue
      }
      lines.push(`## ${lane.title}${lane.workspace ? ` (${lane.workspace})` : ''}`)
      for (const step of lane.summary?.steps ?? []) {
        lines.push(`- [${step.status === 'done' ? 'x' : ' '}] ${step.label}`)
      }
      lines.push('')
      for (const turn of lane.turns) {
        lines.push(`- ${formatClock(turn.startedAt)} **Q** ${turn.question} → ${turn.result}`)
      }
      lines.push('')
    }
    void navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const totalTurns = lanes.reduce((n, lane) => n + lane.turns.length, 0)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <Waypoints className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          {translate('auto.components.sidebar.SidebarNav.todaysFlow', "Today's flow")}
        </h2>
        <div className="ml-3 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-[88px] text-center text-xs tabular-nums">{date}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={date >= today}
            onClick={() => setDate(shiftDate(date, 1))}
          >
            <ChevronRight className="size-3.5" />
          </Button>
          {date !== today && (
            <Button type="button" variant="ghost" size="xs" onClick={() => setDate(today)}>
              {translate('auto.components.flow.FlowBoardPage.today', 'Today')}
            </Button>
          )}
        </div>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.flow.FlowBoardPage.stats',
            '{{value0}} tasks · {{value1}} questions',
            {
              value0: lanes.length,
              value1: totalTurns
            }
          )}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          className="ml-auto"
          disabled={!totalTurns}
          onClick={copyMarkdown}
        >
          <Copy className="size-3" />
          {copied
            ? translate('auto.components.flow.FlowBoardPage.copied', 'Copied')
            : translate('auto.components.flow.FlowBoardPage.copyMarkdown', 'Copy as Markdown')}
        </Button>
      </div>

      {lanes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Waypoints className="size-7 opacity-50" />
          {loading
            ? translate('auto.components.flow.FlowBoardPage.loading', 'Loading…')
            : translate(
                'auto.components.flow.FlowBoardPage.empty',
                'No agent work recorded for this day.'
              )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden p-3 scrollbar-sleek">
          {lanes.map((lane) => (
            <LaneColumn key={lane.paneKey} lane={lane} />
          ))}
        </div>
      )}
    </div>
  )
}
