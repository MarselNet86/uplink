import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  mono?: boolean | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, mono, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <label htmlFor={inputId} className={cn('field', error && 'field--error')}>
        {label && <span className="field-label">{label}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn('field-input', mono && 'mono', className)}
          aria-invalid={!!error}
          {...props}
        />
        {error ? (
          <span className="field-hint">{error}</span>
        ) : hint ? (
          <span className="field-hint">{hint}</span>
        ) : null}
      </label>
    );
  },
);
Input.displayName = 'Input';
