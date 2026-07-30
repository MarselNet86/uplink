import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className={cn('flex flex-col gap-1.5', error && 'group')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[length:var(--t-caption)] uppercase tracking-[0.14em] text-muted"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'border-0 border-b bg-transparent py-1.5 font-sans text-[length:var(--t-body)] text-ink outline-none transition-colors placeholder:text-rule',
            error ? 'border-oxide' : 'border-rule focus:border-ink',
            className,
          )}
          aria-invalid={!!error}
          {...props}
        />
        {error ? (
          <span className="text-[11px] leading-tight text-oxide">{error}</span>
        ) : hint ? (
          <span className="text-[11px] leading-tight text-muted">{hint}</span>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
