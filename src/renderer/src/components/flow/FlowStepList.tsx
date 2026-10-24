import { cn } from '@/lib/utils'
import type { FlowStep } from '../../../../shared/flow-log-types'

/** Vertical step flow: done (filled), doing (pulsing), todo (hollow), joined by a rail. */
export function FlowStepList({ steps }: { steps: FlowStep[] }): React.JSX.Element | null {
  if (!steps.length) {
    return null
  }
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li
          key={`${index}-${step.label}`}
          className="relative flex items-start gap-2 pb-2 last:pb-0"
        >
          {index < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                'absolute left-[4.5px] top-3.5 bottom-0 w-px',
                step.status === 'done' ? 'bg-emerald-500/40' : 'bg-border'
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              'mt-[3px] size-2.5 shrink-0 rounded-full border',
              step.status === 'done' && 'border-emerald-500 bg-emerald-500',
              step.status === 'doing' && 'animate-pulse border-amber-500 bg-amber-500',
              step.status === 'todo' && 'border-muted-foreground/50 bg-transparent'
            )}
          />
          <span
            className={cn(
              'min-w-0 text-xs leading-snug break-words',
              step.status === 'todo' ? 'text-muted-foreground' : 'text-foreground/90'
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}
