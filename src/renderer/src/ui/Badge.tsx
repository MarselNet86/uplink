import type { ReactNode } from 'react';
import { cn } from './lib/utils';

export interface BadgeProps {
  tone?: 'default' | 'success' | 'warn' | 'danger';
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'border-rule text-muted',
  success: 'border-ink text-ink',
  warn: 'border-oxide/60 text-oxide',
  danger: 'border-oxide text-oxide',
};

export function Badge({ tone = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-control border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
