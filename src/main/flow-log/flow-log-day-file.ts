import type { FlowTurn } from '../../shared/flow-log-types'

/** One line of a `flow-log/YYYY-MM-DD.jsonl` day file: a finished turn, or its later summary. */
export type FlowDayLine =
  | { kind: 'turn'; turn: FlowTurn }
  | { kind: 'summary'; id: string; question: string; result: string }

/** Folds a day file's lines into its turns (oldest first), applying summaries to their turns. */
export function parseFlowDayFile(text: string): FlowTurn[] {
  const turns = new Map<string, FlowTurn>()
  for (const raw of text.split('\n')) {
    if (!raw.trim()) {
      continue
    }
    try {
      const line = JSON.parse(raw) as FlowDayLine
      if (line.kind === 'turn') {
        turns.set(line.turn.id, line.turn)
      } else if (line.kind === 'summary') {
        const turn = turns.get(line.id)
        if (turn) {
          turns.set(line.id, {
            ...turn,
            question: line.question,
            result: line.result,
            summarized: true
          })
        }
      }
    } catch {
      // Skip a torn line (crash mid-append).
    }
  }
  return [...turns.values()].sort((a, b) => a.startedAt - b.startedAt)
}
