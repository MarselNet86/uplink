import type { StepView } from '@shared/types';

export interface StepListProps {
  steps: StepView[];
  ticks?: Partial<Record<StepView['id'], string>>;
}

const GLYPH: Record<StepView['status'], string> = {
  pending: '+',
  running: '·',
  done: '−',
  failed: '×',
  skipped: '/',
};

/** No checkmarks, no spinners: a glyph per state (design code 04). */
export function StepList({ steps, ticks }: StepListProps) {
  return (
    <ul className="steps">
      {steps.map((step) => (
        <li key={step.id} data-state={step.status} className="step">
          <span className="step-glyph">{GLYPH[step.status]}</span>
          <span>{step.title}</span>
          <span className="step-tick">{ticks?.[step.id] ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}
