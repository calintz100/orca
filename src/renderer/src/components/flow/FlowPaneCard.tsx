import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { AgentStateDot } from '@/components/AgentStateDot'
import { agentRowDotState } from '@/lib/agent-row-dot-state'
import { FlowStepList } from './FlowStepList'
import { formatClock, formatDuration, useFlowPaneSummary, useFlowPaneTurns } from './use-flow-log'
import { focusFlowPane } from './flow-focus'

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

/** Live agent fields for a pane, read per field so unrelated status churn doesn't re-render. */
export function usePaneLiveAgent(paneKey: string): {
  state?: string
  workingMode?: string
  prompt?: string
  tool?: string
} {
  const state = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state)
  const workingMode = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.workingMode)
  const prompt = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.prompt)
  const tool = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.toolName)
  return { state, workingMode, prompt, tool }
}

export function isActiveAgentState(state: string | undefined): boolean {
  return state === 'working' || state === 'waiting' || state === 'blocked'
}

function PaneHistory({ paneKey }: { paneKey: string }): React.JSX.Element | null {
  const turns = useFlowPaneTurns(paneKey)
  if (!turns.length) {
    return null
  }
  return (
    <section className="mt-2">
      <SectionLabel>
        {translate('auto.components.flow.FlowPanel.history', 'Questions')}
      </SectionLabel>
      <ol className="flex flex-col divide-y divide-border/60">
        {turns.toReversed().map((turn, i) => (
          <li key={turn.id} className="py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="rounded-full bg-muted px-1.5 tabular-nums">{turns.length - i}</span>
              <span className="tabular-nums">{formatClock(turn.startedAt)}</span>
              <span>· {formatDuration(turn.endedAt - turn.startedAt)}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs leading-snug" title={turn.prompt}>
              {turn.question}
            </div>
            <div className="line-clamp-3 text-[11px] leading-snug text-muted-foreground">
              → {turn.result || '—'}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * One agent pane's flow: title, what it is doing now or the previous question → how it was
 * handled, and (expanded) its steps and question history. Clicking the title focuses the pane.
 */
export function FlowPaneCard({
  paneKey,
  worktreeId,
  tabId,
  fallbackTitle,
  focused,
  defaultExpanded = false
}: {
  paneKey: string
  worktreeId?: string
  tabId?: string
  fallbackTitle: string
  focused: boolean
  defaultExpanded?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const summary = useFlowPaneSummary(paneKey)
  const live = usePaneLiveAgent(paneKey)
  const working = isActiveAgentState(live.state)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2',
        focused ? 'border-ring/60 bg-ring/5' : 'border-sidebar-border bg-background/40'
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-label={translate(
            'auto.components.flow.FlowPaneCard.toggle',
            'Show steps and history'
          )}
        >
          <Chevron className="size-3.5" />
        </button>
        {live.state && (
          <AgentStateDot
            state={agentRowDotState(live.state as never, live.workingMode as never)}
            size="sm"
          />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:underline"
          title={translate('auto.components.flow.FlowPaneCard.focus', 'Go to this terminal')}
          onClick={() => focusFlowPane({ paneKey, worktreeId, tabId })}
        >
          {summary?.title || fallbackTitle}
        </button>
        {summary && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {translate('auto.components.flow.FlowPanel.turnCount', '{{value0}} questions', {
              value0: summary.turnCount
            })}
          </span>
        )}
      </div>

      <div className="mt-1.5 pl-5">
        {working && live.prompt ? (
          <>
            <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {translate('auto.components.flow.FlowPanel.now', 'Doing now')}
            </div>
            <div className="line-clamp-2 text-xs leading-snug">{live.prompt}</div>
            {live.tool && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {live.tool}
              </div>
            )}
          </>
        ) : summary?.lastQuestion ? (
          <>
            <div className="line-clamp-2 text-xs leading-snug">
              <span className="mr-1 text-[10px] font-semibold text-muted-foreground">
                {translate('auto.components.flow.FlowPaneCard.prevQuestion', 'Previous question')}
              </span>
              {summary.lastQuestion}
            </div>
            <div className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-foreground/75">
              → {summary.lastResult || '—'}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            {translate('auto.components.flow.FlowBoardPage.noQuestions', 'No questions yet.')}
          </div>
        )}
        {summary?.summarizing && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {translate('auto.components.flow.FlowPanel.summarizing', 'Summarizing…')}
          </div>
        )}

        {expanded && (
          <>
            {!!summary?.steps.length && (
              <section className="mt-2">
                <SectionLabel>
                  {translate('auto.components.flow.FlowPanel.steps', 'Steps')}
                </SectionLabel>
                <FlowStepList steps={summary.steps} />
              </section>
            )}
            <PaneHistory paneKey={paneKey} />
          </>
        )}
      </div>
    </div>
  )
}
