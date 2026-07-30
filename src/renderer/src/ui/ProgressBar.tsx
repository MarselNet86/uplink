import { cn } from './lib/utils';

export interface ProgressBarProps {
  percent: number;
  indeterminate?: boolean;
  failed?: boolean;
  className?: string;
}

export function ProgressBar({ percent, indeterminate, failed, className }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-px w-full bg-rule', className)}
    >
      <div
        className={cn(
          'h-px transition-[width] duration-200 ease-out',
          failed ? 'bg-oxide' : 'bg-ink',
          indeterminate && 'w-1/3 animate-pulse',
        )}
        style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
