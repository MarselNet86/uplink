import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './lib/utils';

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <label htmlFor={inputId} className={cn('field', error && 'field--error')}>
        {label && <span className="field-label">{label}</span>}
        <span className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            className={cn('field-input pr-10', className)}
            aria-invalid={!!error}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="eyebrow absolute right-0 cursor-pointer bg-transparent"
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {visible ? 'скрыть' : 'показать'}
          </button>
        </span>
        {error ? (
          <span className="field-hint">{error}</span>
        ) : hint ? (
          <span className="field-hint">{hint}</span>
        ) : null}
      </label>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
