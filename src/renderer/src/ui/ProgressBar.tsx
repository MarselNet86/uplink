import { cn } from './lib/utils';

export interface ProgressBarProps {
  stage: string;
  percent: number;
  failed?: boolean;
  className?: string;
}

/** Stage label left, percent right, hairline track between (design code 04). */
export function ProgressBar({ stage, percent, failed, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn('progress', failed && 'progress--failed', className)}>
      <div className="progress-head">
        <span className="progress-stage">{stage}</span>
        <span className="progress-pct">{Math.floor(clamped)} %</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
