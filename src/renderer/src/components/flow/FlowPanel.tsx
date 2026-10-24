import { Waypoints } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import { FlowPaneCard } from './FlowPaneCard'
import { useFlowPaneSummary } from './use-flow-log'

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

/**
 * Right-sidebar "Flow" tab: the focused agent pane's flow (each pane also shows its own flow
 * beside its terminal). Click another pane to switch.
 */
export default function FlowPanel(): React.JSX.Element {
  const focusedPaneKey = useFocusedPaneKey()
  const summary = useFlowPaneSummary(focusedPaneKey)
  const { worktreeId, tabTitle, hasAgent } = useAppStore(
    useShallow((s) => {
      const tabId = focusedPaneKey ? parsePaneKey(focusedPaneKey)?.tabId : undefined
      const tab = s.activeWorktreeId
        ? s.tabsByWorktree[s.activeWorktreeId]?.find((t) => t.id === tabId)
        : undefined
      return {
        worktreeId: s.activeWorktreeId,
        tabTitle: tab ? tab.customTitle || tab.generatedTitle || tab.title || '' : '',
        hasAgent: !!(focusedPaneKey && s.agentStatusByPaneKey[focusedPaneKey])
      }
    })
  )

  if (!focusedPaneKey || (!summary && !hasAgent)) {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-2.5 scrollbar-sleek">
      <FlowPaneCard
        key={focusedPaneKey}
        paneKey={focusedPaneKey}
        worktreeId={worktreeId ?? undefined}
        tabId={parsePaneKey(focusedPaneKey)?.tabId}
        fallbackTitle={tabTitle || translate('auto.components.flow.FlowPanel.untitled', 'New task')}
        focused={false}
        defaultExpanded
      />
    </div>
  )
}
