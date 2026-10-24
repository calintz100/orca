import { Waypoints } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { AgentStateDot } from '@/components/AgentStateDot'
import { agentRowDotState } from '@/lib/agent-row-dot-state'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import { FlowStepList } from './FlowStepList'
import { formatClock, formatDuration, useFlowPaneSummaries, useFlowPaneTurns } from './use-flow-log'

/** The focused terminal pane's key, whether or not an agent row exists for it yet. */
function useFocusedPaneKey(): string | null {
  return useAppStore((s) => {
    if (s.activeTabType !== 'terminal' || !s.activeTabId) {
      return null
    }
    const leafId = s.terminalLayoutsByTabId[s.activeTabId]?.activeLeafId
    return leafId && isTerminalLeafId(leafId) ? makePaneKey(s.activeTabId, leafId) : null
  })
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

/**
 * Right-sidebar "Flow" tab: what the focused agent pane is doing now, its task steps, the last
 * question and how it was handled, and its earlier questions newest first.
 */
export default function FlowPanel(): React.JSX.Element {
  const paneKey = useFocusedPaneKey()
  const summaries = useFlowPaneSummaries()
  const turns = useFlowPaneTurns(paneKey)
  const state = useAppStore((s) => (paneKey ? s.agentStatusByPaneKey[paneKey]?.state : undefined))
  const workingMode = useAppStore((s) =>
    paneKey ? s.agentStatusByPaneKey[paneKey]?.workingMode : undefined
  )
  const livePrompt = useAppStore((s) =>
    paneKey ? s.agentStatusByPaneKey[paneKey]?.prompt : undefined
  )
  const liveTool = useAppStore((s) =>
    paneKey ? s.agentStatusByPaneKey[paneKey]?.toolName : undefined
  )
  const summary = paneKey ? summaries.get(paneKey) : undefined

  if (!paneKey || (!summary && !state && !turns.length)) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center text-muted-foreground">
        <Waypoints size={32} className="mb-3 opacity-50" />
        <p className="text-sm">
          {translate(
            'auto.components.flow.FlowPanel.empty',
            'Focus an agent terminal to see its task flow.'
          )}
        </p>
      </div>
    )
  }

  const active = state === 'working' || state === 'waiting' || state === 'blocked'
  const recent = turns.toReversed()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-sidebar-border px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          {state && <AgentStateDot state={agentRowDotState(state, workingMode)} size="sm" />}
          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
            {summary?.title || translate('auto.components.flow.FlowPanel.untitled', 'New task')}
          </div>
          {summary?.summarizing && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {translate('auto.components.flow.FlowPanel.summarizing', 'Summarizing…')}
            </span>
          )}
        </div>
        {summary && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {translate('auto.components.flow.FlowPanel.turnCount', '{{value0}} questions', {
              value0: summary.turnCount
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 scrollbar-sleek">
        {active && livePrompt && (
          <section className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.now', 'Doing now')}
            </SectionLabel>
            <div className="line-clamp-3 text-xs leading-snug text-foreground">{livePrompt}</div>
            {liveTool && (
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {liveTool}
              </div>
            )}
          </section>
        )}

        {!!summary?.steps.length && (
          <section className="mb-3">
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.steps', 'Steps')}
            </SectionLabel>
            <FlowStepList steps={summary.steps} />
          </section>
        )}

        {summary?.lastQuestion && (
          <section className="mb-3">
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.lastQuestion', 'Last question')}
            </SectionLabel>
            <div className="text-xs leading-snug text-foreground">{summary.lastQuestion}</div>
            <div className="mt-2">
              <SectionLabel>
                {translate('auto.components.flow.FlowPanel.result', 'Result')}
              </SectionLabel>
            </div>
            <div className="text-xs leading-snug text-foreground/80">
              {summary.lastResult || '—'}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <SectionLabel>
              {translate('auto.components.flow.FlowPanel.history', 'Questions')}
            </SectionLabel>
            <ol className="flex flex-col divide-y divide-border/60">
              {recent.map((turn, i) => (
                <li key={turn.id} className="py-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-1.5 tabular-nums">
                      {turns.length - i}
                    </span>
                    <span className="tabular-nums">{formatClock(turn.startedAt)}</span>
                    <span>· {formatDuration(turn.endedAt - turn.startedAt)}</span>
                    {turn.tools.length > 0 && (
                      <span>
                        ·{' '}
                        {translate('auto.components.flow.FlowPanel.toolCount', '{{value0}} tools', {
                          value0: turn.tools.length
                        })}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-0.5 line-clamp-2 text-xs leading-snug text-foreground"
                    title={turn.prompt}
                  >
                    {turn.question}
                  </div>
                  <div
                    className="line-clamp-3 text-[11px] leading-snug text-muted-foreground"
                    title={turn.assistant}
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
