import os from 'node:os'
import type { FlowStep, FlowTurn } from '../../shared/flow-log-types'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import { prepareLocalCommitMessageAgentEnv } from '../text-generation/commit-message-agent-environment'
import { runGenerationRequest } from '../text-generation/agent-generation-request'
import { spawnSourceControlAgent } from '../text-generation/source-control-agent-launch'

export type FlowTurnSummary = {
  title: string
  steps: FlowStep[]
  question: string
  result: string
}

export function clipText(value: string | undefined, max: number): string {
  const s = (value ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Used when the model is unavailable: still records the turn as a finished step. */
export function fallbackSummary(
  turn: Pick<FlowTurn, 'prompt' | 'assistant'>,
  prev: { title: string; steps: FlowStep[] }
): FlowTurnSummary {
  const steps = prev.steps.map((s) =>
    s.status === 'doing' ? { ...s, status: 'done' as const } : s
  )
  if (turn.prompt) {
    steps.push({ label: clipText(turn.prompt, 24), status: 'done' })
  }
  return {
    title: prev.title || clipText(turn.prompt, 40),
    steps: steps.slice(-8),
    question: clipText(turn.prompt, 90),
    result: clipText(turn.assistant, 140)
  }
}

function buildPrompt(turn: FlowTurn, prev: { title: string; steps: FlowStep[] }): string {
  const tools =
    turn.tools
      .slice(-25)
      .map((t) => `- ${t}`)
      .join('\n') || '(none)'
  return `You keep a developer's work log. Below is one finished turn from a coding-agent terminal pane.
Update that pane's overall task flow and output exactly one JSON object, no prose, no code fence.
Write every string in the same language the user wrote the question in.

[Task title so far] ${prev.title || '(none)'}
[Steps so far] ${JSON.stringify(prev.steps)}

[User question]
${clipText(turn.prompt, 2000)}

[Tools used this turn]
${tools}

[Agent's final reply]
${clipText(turn.assistant, 4000)}

Output shape:
{"title":"short title for the pane's whole task (<= 20 chars)","steps":[{"label":"step (<= 15 chars)","status":"done|doing|todo"}],"question":"one-line summary of this question (<= 50 chars)","result":"one-line summary of how it was handled (<= 80 chars)"}
Rules: keep and update the existing steps, add new ones when needed, at most 8. Steps finished this turn are done; next steps the reply mentions are todo.`
}

function parseSummary(text: string): FlowTurnSummary | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    return null
  }
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>
    const steps = Array.isArray(raw.steps)
      ? raw.steps
          .filter(
            (s): s is { label: string; status?: unknown } =>
              !!s && typeof s === 'object' && typeof (s as { label?: unknown }).label === 'string'
          )
          .slice(0, 8)
          .map((s): FlowStep => ({
            label: clipText(s.label, 30),
            status: s.status === 'done' || s.status === 'doing' ? s.status : 'todo'
          }))
      : []
    return {
      title: clipText(typeof raw.title === 'string' ? raw.title : '', 40),
      steps,
      question: clipText(typeof raw.question === 'string' ? raw.question : '', 100),
      result: clipText(typeof raw.result === 'string' ? raw.result : '', 160)
    }
  } catch {
    return null
  }
}

/** One-shot Haiku call through Orca's background-agent runner (hooks disabled, no session saved). */
export async function summarizeFlowTurn(
  turn: FlowTurn,
  prev: { title: string; steps: FlowStep[] },
  resolvers: CommitMessageAgentEnvironmentResolvers | undefined
): Promise<FlowTurnSummary> {
  const fallback = fallbackSummary(turn, prev)
  try {
    const env = await prepareLocalCommitMessageAgentEnv('claude', resolvers)
    if (!env.ok) {
      return fallback
    }
    const result = await runGenerationRequest({
      params: { agentId: 'claude', model: 'haiku', agentArgs: '--no-session-persistence' },
      prompt: buildPrompt(turn, prev),
      target: { kind: 'local', cwd: os.tmpdir(), env: env.env },
      emptyResultName: 'flow summary',
      operation: 'flow-summary',
      spawnAgent: spawnSourceControlAgent
    })
    if (!result.success) {
      console.warn('[flow-log] summary failed:', result.error)
      return fallback
    }
    const parsed = parseSummary(result.rawOutput)
    if (!parsed) {
      return fallback
    }
    return {
      title: parsed.title || fallback.title,
      steps: parsed.steps.length ? parsed.steps : fallback.steps,
      question: parsed.question || fallback.question,
      result: parsed.result || fallback.result
    }
  } catch (error) {
    console.warn('[flow-log] summary threw:', error)
    return fallback
  }
}
