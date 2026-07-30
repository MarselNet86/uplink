export interface StepperProps {
  current: 1 | 2 | 3 | 4;
  labels?: [string, string, string, string];
}

const defaultLabels: [string, string, string, string] = [
  'Сервер',
  'Протоколы',
  'Установка',
  'Ключи',
];

export function Stepper({ current, labels = defaultLabels }: StepperProps) {
  return (
    <div className="stepper">
      {labels.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3 | 4;
        const state = step === current ? 'current' : step < current ? 'done' : undefined;
        return (
          <span key={label} className="stepper-item" data-state={state}>
            <span className="stepper-n">{String(step).padStart(2, '0')}</span>
            {label}
          </span>
        );
      })}
    </div>
  );
}
