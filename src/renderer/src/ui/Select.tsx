import { cn } from './lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Native `<select>`, stripped to a hairline underline (design code 05). */
export function Select({ label, options, value, onChange, className }: SelectProps) {
  return (
    <label className={cn('field', className)}>
      {label && <span className="field-label">{label}</span>}
      <select className="field-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
