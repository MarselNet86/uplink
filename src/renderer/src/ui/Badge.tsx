import type { ReactNode } from 'react';
import { cn } from './lib/utils';

export interface BadgeProps {
  tone?: 'default' | 'success' | 'danger';
  children: ReactNode;
  className?: string;
}

const toneClass: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: '',
  success: 'badge--ink',
  danger: 'badge--oxide',
};

export function Badge({ tone = 'default', children, className }: BadgeProps) {
  return <span className={cn('badge', toneClass[tone], className)}>{children}</span>;
}
