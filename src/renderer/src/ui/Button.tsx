import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-sans text-[length:var(--t-small)] transition-colors disabled:cursor-not-allowed disabled:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink',
  {
    variants: {
      variant: {
        primary:
          'rounded-control bg-graphite px-5 py-2.5 text-paper hover:bg-ink disabled:bg-rule disabled:text-paper',
        secondary:
          'border-b border-rule px-0 py-1 text-muted hover:border-ink hover:text-ink disabled:border-rule disabled:text-rule',
        ghost: 'border-b border-transparent px-0 py-1 text-muted hover:text-ink',
        danger: 'border-b border-oxide px-0 py-1 text-oxide hover:opacity-80',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        buttonVariants({ variant }),
        loading && 'cursor-progress opacity-70',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Загрузка…' : children}
    </button>
  ),
);
Button.displayName = 'Button';
