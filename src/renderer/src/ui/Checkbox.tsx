import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from './lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  className,
}: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <RadixCheckbox.Root
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-structure border border-rule bg-transparent data-[state=checked]:border-ink data-[state=checked]:bg-ink"
      >
        <RadixCheckbox.Indicator className="text-paper">
          <Check size={12} strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className="flex flex-col">
        <span className="text-[length:var(--t-body)] text-ink">{label}</span>
        {description && <span className="text-[11px] text-muted">{description}</span>}
      </span>
    </label>
  );
}
