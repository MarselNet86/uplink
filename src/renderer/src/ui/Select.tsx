import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
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
  placeholder?: string;
  className?: string;
}

export function Select({ label, options, value, onChange, placeholder, className }: SelectProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <span className="text-[length:var(--t-caption)] uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
      )}
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger className="flex items-center justify-between border-0 border-b border-rule bg-transparent py-1.5 text-left font-sans text-[length:var(--t-body)] text-ink outline-none transition-colors focus:border-ink data-[placeholder]:text-rule">
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown size={14} className="text-muted" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="overflow-hidden rounded-structure border border-rule bg-well text-ink shadow-none">
            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-pointer items-center justify-between px-3 py-2 text-[length:var(--t-small)] outline-none data-[highlighted]:bg-paper"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Check size={13} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
