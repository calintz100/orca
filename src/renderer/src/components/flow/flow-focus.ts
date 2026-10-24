import { useAppStore } from '@/store'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { parsePaneKey } from '../../../../shared/stable-pane-id'

/** Focus an agent pane (switching workspace/tab as needed). Returns false when it no longer exists. */
export function focusFlowPane(target: {
  paneKey: string
  worktreeId?: string
  tabId?: string
}): boolean {
  const parsed = parsePaneKey(target.paneKey)
  const tabId = target.tabId ?? parsed?.tabId
  if (!target.worktreeId || !tabId) {
    return false
  }
  if (
    activateAndRevealWorkspace(target.worktreeId, {
      revealInSidebar: false,
      clearSidebarFilters: false
    }) === false
  ) {
    return false
  }
  const state = useAppStore.getState()
  if (!(state.tabsByWorktree[target.worktreeId] ?? []).some((tab) => tab.id === tabId)) {
    return false
  }
  state.setActiveTabType('terminal', target.worktreeId)
  activateTabAndFocusPane(tabId, parsed?.leafId ?? null, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return true
}
