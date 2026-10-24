import { useMemo } from 'react'
import { Waypoints } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import { FlowPaneCard } from './FlowPaneCard'
import { useFlowPaneSummaries } from './use-flow-log'

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
 * Right-sidebar "Flow" tab: one card per agent pane of the active workspace, so every pane's
 * previous question → result is visible at once. The focused pane is highlighted and expanded.
 */
export default function FlowPanel(): React.JSX.Element {
  const focusedPaneKey = useFocusedPaneKey()
  const summaries = useFlowPaneSummaries()
  const { worktreeId, tabs, agentPaneKeys } = useAppStore(
    useShallow((s) => ({
      worktreeId: s.activeWorktreeId,
      tabs: s.activeWorktreeId ? s.tabsByWorktree[s.activeWorktreeId] : undefined,
      agentPaneKeys: Object.keys(s.agentStatusByPaneKey).join('|')
    }))
  )

  const panes = useMemo(() => {
    const tabOrder = new Map((tabs ?? []).map((tab, i) => [tab.id, i]))
    const tabTitle = new Map(
      (tabs ?? []).map((tab) => [tab.id, tab.customTitle || tab.generatedTitle || tab.title || ''])
    )
    const keys = new Set<string>()
    for (const key of agentPaneKeys ? agentPaneKeys.split('|') : []) {
      if (tabOrder.has(parsePaneKey(key)?.tabId ?? '')) {
        keys.add(key)
      }
    }
    for (const summary of summaries.values()) {
      if (
        summary.worktreeId === worktreeId &&
        tabOrder.has(parsePaneKey(summary.paneKey)?.tabId ?? '')
      ) {
        keys.add(summary.paneKey)
      }
    }
    return [...keys]
      .map((paneKey) => {
        const tabId = parsePaneKey(paneKey)?.tabId ?? ''
        return { paneKey, tabId, order: tabOrder.get(tabId) ?? 0, title: tabTitle.get(tabId) ?? '' }
      })
      .sort((a, b) => a.order - b.order || a.paneKey.localeCompare(b.paneKey))
  }, [tabs, agentPaneKeys, summaries, worktreeId])

  if (!panes.length) {
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2.5 scrollbar-sleek">
      {panes.map((pane) => (
        <FlowPaneCard
          key={pane.paneKey}
          paneKey={pane.paneKey}
          worktreeId={worktreeId ?? undefined}
          tabId={pane.tabId}
          fallbackTitle={
            pane.title || translate('auto.components.flow.FlowPanel.untitled', 'New task')
          }
          focused={pane.paneKey === focusedPaneKey}
          defaultExpanded={pane.paneKey === focusedPaneKey}
        />
      ))}
    </div>
  )
}
