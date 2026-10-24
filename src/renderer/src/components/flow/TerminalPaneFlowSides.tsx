import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { AgentStateDot } from '@/components/AgentStateDot'
import { agentRowDotState } from '@/lib/agent-row-dot-state'
import type { TerminalPaneController } from '@/components/terminal-pane/use-terminal-pane-controller'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { FlowStepList } from './FlowStepList'
import { isActiveAgentState, usePaneLiveAgent } from './FlowPaneCard'
import { formatClock, formatDuration, useFlowPaneSummary, useFlowPaneTurns } from './use-flow-log'

const OPEN_WIDTH_PX = 260
const RAIL_WIDTH_PX = 26
/** Below this pane width the panel starts folded, so the terminal keeps usable columns. */
const AUTO_FOLD_PANE_WIDTH_PX = 640

// Per-pane open/folded choice, kept across remounts (tab switches) for this session.
const userChoice = new Map<string, boolean>()

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

/** Reserves the panel's width on its pane so the terminal narrows and refits beside it. */
function useReservePaneSideWidth(widthPx: number): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const pane = ref.current?.parentElement
    if (!pane) {
      return
    }
    pane.style.setProperty('--orca-pane-flow-side-width', `${widthPx}px`)
    return () => {
      pane.style.removeProperty('--orca-pane-flow-side-width')
    }
  }, [widthPx])
  return ref
}

function usePaneWidth(paneEl: HTMLElement): number {
  const [width, setWidth] = useState(() => paneEl.clientWidth)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => setWidth(paneEl.clientWidth))
    observer.observe(paneEl)
    return () => observer.disconnect()
  }, [paneEl])
  return width
}

function PaneFlowSideBody({
  paneKey,
  paneEl
}: {
  paneKey: string
  paneEl: HTMLElement
}): React.JSX.Element {
  const paneWidth = usePaneWidth(paneEl)
  const [choice, setChoice] = useState<boolean | undefined>(() => userChoice.get(paneKey))
  const open = choice ?? paneWidth >= AUTO_FOLD_PANE_WIDTH_PX
  const ref = useReservePaneSideWidth(open ? OPEN_WIDTH_PX : RAIL_WIDTH_PX)
  const summary = useFlowPaneSummary(paneKey)
  const live = usePaneLiveAgent(paneKey)
  const turns = useFlowPaneTurns(open ? paneKey : null)
  const working = isActiveAgentState(live.state)
  const toggle = (): void => {
    userChoice.set(paneKey, !open)
    setChoice(!open)
  }
  const dot = live.state ? (
    <AgentStateDot
      state={agentRowDotState(live.state as never, live.workingMode as never)}
      size="sm"
    />
  ) : null

  if (!open) {
    return (
      <div
        ref={ref}
        className="pane-flow-side flex flex-col items-center gap-2 border-l border-border/70 bg-background/95 pt-7"
      >
        <button
          type="button"
          onClick={toggle}
          className="text-muted-foreground hover:text-foreground"
          title={translate('auto.components.flow.TerminalPaneFlowSides.open', 'Show task flow')}
        >
          <PanelRightOpen className="size-3.5" />
        </button>
        {dot}
      </div>
    )
  }

  const title = summary?.title || translate('auto.components.flow.FlowPanel.untitled', 'New task')
  return (
    <div
      ref={ref}
      className="pane-flow-side flex flex-col border-l border-border/70 bg-background/95 text-xs"
    >
      {/* Why pt-7: the pane's split/close controls float over its top-right corner. */}
      <div className="flex shrink-0 items-start gap-1.5 border-b border-border/60 px-2.5 pt-7 pb-2">
        <div className="mt-0.5">{dot}</div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-semibold leading-snug" title={title}>
            {title}
          </div>
          {summary && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {translate('auto.components.flow.FlowPanel.turnCount', '{{value0}} questions', {
                value0: summary.turnCount
              })}
              {summary.summarizing &&
                ` · ${translate('auto.components.flow.FlowPanel.summarizing', 'Summarizing…')}`}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={translate('auto.components.flow.TerminalPaneFlowSides.close', 'Hide task flow')}
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 scrollbar-sleek">
        {working && live.prompt && (
          <section className="mb-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.now', 'Doing now')}
            </SectionLabel>
            <div className="line-clamp-3 leading-snug">{live.prompt}</div>
            {live.tool && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {live.tool}
              </div>
            )}
          </section>
        )}

        <section className="mb-2.5">
          <SectionLabel>
            {translate('auto.components.flow.FlowPaneCard.prevQuestion', 'Previous question')}
          </SectionLabel>
          {summary?.lastQuestion ? (
            <>
              <div className="leading-snug">{summary.lastQuestion}</div>
              <div className="mt-1.5">
                <SectionLabel>
                  {translate('auto.components.flow.FlowPanel.result', 'Result')}
                </SectionLabel>
              </div>
              <div className="leading-snug text-foreground/80">{summary.lastResult || '—'}</div>
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              {translate('auto.components.flow.FlowBoardPage.noQuestions', 'No questions yet.')}
            </div>
          )}
        </section>

        {!!summary?.steps.length && (
          <section className="mb-2.5">
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.steps', 'Steps')}
            </SectionLabel>
            <FlowStepList steps={summary.steps} />
          </section>
        )}

        {turns.length > 1 && (
          <section>
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.history', 'Questions')}
            </SectionLabel>
            <ol className="flex flex-col divide-y divide-border/60">
              {turns.toReversed().map((turn, i) => (
                <li key={turn.id} className="py-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-1.5 tabular-nums">
                      {turns.length - i}
                    </span>
                    <span className="tabular-nums">{formatClock(turn.startedAt)}</span>
                    <span>· {formatDuration(turn.endedAt - turn.startedAt)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 leading-snug" title={turn.prompt}>
                    {turn.question}
                  </div>
                  <div
                    className={cn('line-clamp-3 text-[11px] leading-snug text-muted-foreground')}
                  >
                    → {turn.result || '—'}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

/** Shown only for panes that run an agent (live status or a recorded flow). */
function PaneFlowSide({
  paneKey,
  paneEl
}: {
  paneKey: string
  paneEl: HTMLElement
}): React.JSX.Element | null {
  const summary = useFlowPaneSummary(paneKey)
  const live = usePaneLiveAgent(paneKey)
  return summary || live.state ? <PaneFlowSideBody paneKey={paneKey} paneEl={paneEl} /> : null
}

/** Mounts a flow side panel beside every pane of a terminal tab. */
export function TerminalPaneFlowSides({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element {
  const { managedPanes, tabId } = controller
  return (
    <>
      {managedPanes.map((pane) =>
        createPortal(
          <PaneFlowSide paneKey={makePaneKey(tabId, pane.leafId)} paneEl={pane.container} />,
          pane.container,
          `flow-side-${pane.id}`
        )
      )}
    </>
  )
}
