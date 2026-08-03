import { cn } from './lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  className?: string;
}

/** Square outline; checked state shows a smaller square inside it, no tick icon. */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  className,
}: CheckboxProps) {
  return (
    <label className={cn('check', disabled && 'check--off', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span className="check-box" />
      <span className="check-text">
        {label}
        {description && <span className="check-sub">{description}</span>}
      </span>
    </label>
  );
}
