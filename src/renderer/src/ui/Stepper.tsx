import { cn } from './lib/utils';

export interface StepperProps {
  current: 1 | 2 | 3 | 4;
  labels?: [string, string, string, string];
}

const defaultLabels: [string, string, string, string] = [
  'Подключение',
  'Выбор ПО',
  'Установка',
  'Ключи',
];

export function Stepper({ current, labels = defaultLabels }: StepperProps) {
  return (
    <ol className="flex items-center gap-3">
      {labels.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3 | 4;
        const active = step === current;
        const done = step < current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-control border font-mono text-[10px]',
                active && 'border-ink text-ink',
                done && 'border-ink bg-ink text-paper',
                !active && !done && 'border-rule text-muted',
              )}
            >
              {step}
            </span>
            <span className={cn('text-[11px]', active ? 'text-ink' : 'text-muted')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
