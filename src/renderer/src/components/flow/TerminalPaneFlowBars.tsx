import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { AgentStateDot } from '@/components/AgentStateDot'
import { agentRowDotState } from '@/lib/agent-row-dot-state'
import { useReservePaneTopSpace } from '@/components/terminal-pane/PaneTopWarningBanner'
import type { TerminalPaneController } from '@/components/terminal-pane/use-terminal-pane-controller'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { FlowStepList } from './FlowStepList'
import { isActiveAgentState, usePaneLiveAgent } from './FlowPaneCard'
import { formatClock, useFlowPaneSummary, useFlowPaneTurns } from './use-flow-log'

/** Last few questions of the pane, newest first, shown when the bar is expanded. */
function RecentTurns({ paneKey }: { paneKey: string }): React.JSX.Element | null {
  const turns = useFlowPaneTurns(paneKey)
  const recent = turns.slice(-3).toReversed()
  if (!recent.length) {
    return null
  }
  return (
    <ol className="mt-1.5 flex flex-col gap-1">
      {recent.map((turn) => (
        <li key={turn.id} className="min-w-0 text-[11px] leading-snug">
          <span className="mr-1 tabular-nums text-muted-foreground">
            {formatClock(turn.startedAt)}
          </span>
          <span className="text-foreground/90">{turn.question}</span>
          <span className="text-muted-foreground"> → {turn.result || '—'}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A slim strip across the top of one terminal pane: the pane's task title and what it is doing
 * now, or the previous question → how it was handled. Shown only for panes running an agent.
 */
function PaneFlowBar({ paneKey }: { paneKey: string }): React.JSX.Element | null {
  const summary = useFlowPaneSummary(paneKey)
  const live = usePaneLiveAgent(paneKey)
  const [expanded, setExpanded] = useState(false)
  if (!summary && !live.state) {
    return null
  }
  return (
    <PaneFlowBarBody
      paneKey={paneKey}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    />
  )
}

function PaneFlowBarBody({
  paneKey,
  expanded,
  onToggle
}: {
  paneKey: string
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  // Why a separate body: the space-reserving hook must mount only while the bar is rendered.
  const ref = useReservePaneTopSpace()
  const summary = useFlowPaneSummary(paneKey)
  const live = usePaneLiveAgent(paneKey)
  const working = isActiveAgentState(live.state)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const title = summary?.title || translate('auto.components.flow.FlowPanel.untitled', 'New task')

  return (
    <div
      ref={ref}
      // Why pr-16: the pane's own split/close controls float over its top-right corner.
      className="pane-top-banner border-b border-border/70 bg-background/95 py-1 pr-16 pl-2 text-xs"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-muted-foreground hover:text-foreground"
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
        <span className="max-w-[40%] shrink-0 truncate font-semibold" title={title}>
          {title}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {working && live.prompt ? (
            <>
              <span className="text-amber-600 dark:text-amber-400">
                {translate('auto.components.flow.FlowPanel.now', 'Doing now')}
              </span>{' '}
              {live.prompt}
              {live.tool ? ` · ${live.tool}` : ''}
            </>
          ) : summary?.lastQuestion ? (
            <>
              <span className="text-foreground/85">{summary.lastQuestion}</span> →{' '}
              {summary.lastResult || '—'}
            </>
          ) : (
            translate('auto.components.flow.FlowBoardPage.noQuestions', 'No questions yet.')
          )}
        </span>
      </div>
      {expanded && (
        <div className="max-h-48 overflow-y-auto pt-1 pl-5 scrollbar-sleek">
          {!!summary?.steps.length && <FlowStepList steps={summary.steps} />}
          <RecentTurns paneKey={paneKey} />
        </div>
      )}
    </div>
  )
}

/** Mounts one flow bar into every pane of a terminal tab. */
export function TerminalPaneFlowBars({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element {
  const { managedPanes, tabId } = controller
  return (
    <>
      {managedPanes.map((pane) =>
        createPortal(
          <PaneFlowBar paneKey={makePaneKey(tabId, pane.leafId)} />,
          pane.container,
          `flow-bar-${pane.id}`
        )
      )}
    </>
  )
}
