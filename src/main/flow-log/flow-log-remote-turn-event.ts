import type { FlowRemoteTurnEvent } from '../../shared/flow-log-types'

const MAX_REMOTE_TEXT = 20_000

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, 500) : undefined
}

/** Validates a renderer-sent remote turn step; anything malformed is dropped. */
export function parseFlowRemoteTurnEvent(raw: unknown): FlowRemoteTurnEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  // SAFETY: a non-null object; every field below is read as `unknown` and checked.
  const value = raw as Record<string, unknown>
  const { paneKey, at } = value
  if (typeof paneKey !== 'string' || !paneKey || typeof at !== 'number' || !Number.isFinite(at)) {
    return null
  }
  if (value.kind === 'prompt' && typeof value.prompt === 'string' && value.prompt) {
    return {
      kind: 'prompt',
      paneKey,
      at,
      prompt: value.prompt.slice(0, MAX_REMOTE_TEXT),
      tabId: optionalString(value.tabId),
      worktreeId: optionalString(value.worktreeId),
      agentType: optionalString(value.agentType)
    }
  }
  if (value.kind === 'tool' && typeof value.toolName === 'string' && value.toolName) {
    return { kind: 'tool', paneKey, at, toolName: value.toolName.slice(0, 200) }
  }
  if (value.kind === 'done' && typeof value.assistant === 'string') {
    return { kind: 'done', paneKey, at, assistant: value.assistant.slice(0, MAX_REMOTE_TEXT) }
  }
  return null
}
