import type { StepView } from '@shared/types';
import { cn } from './lib/utils';

export interface StepListProps {
  steps: StepView[];
}

const statusText: Record<StepView['status'], string> = {
  pending: '',
  running: '…',
  done: 'готово',
  failed: 'ошибка',
  skipped: 'пропущено',
};

export function StepList({ steps }: StepListProps) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step) => (
        <li
          key={step.id}
          data-state={step.status}
          className={cn(
            'flex items-center justify-between text-[length:var(--t-small)] text-muted transition-colors',
            step.status === 'running' && 'text-ink',
            step.status === 'done' && 'text-ink',
            step.status === 'failed' && 'text-oxide',
            step.status === 'skipped' && 'text-rule',
          )}
        >
          <span>{step.title}</span>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {statusText[step.status]}
          </span>
        </li>
      ))}
    </ol>
  );
}
