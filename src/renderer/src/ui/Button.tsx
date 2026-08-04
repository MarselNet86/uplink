import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './lib/utils';

const variantClass = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  ghost: 'btn btn--ghost',
  danger: 'btn btn--danger',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClass;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(variantClass[variant], loading && 'btn--loading', className)}
      disabled={disabled || loading}
      {...props}
    >
      {children}
      {loading && <span className="btn-spinner" aria-hidden="true" />}
    </button>
  ),
);
Button.displayName = 'Button';
