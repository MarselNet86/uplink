import type { ReactNode } from 'react';
import { cn } from './lib/utils';

export interface AlertProps {
  tone: 'info' | 'warn' | 'error';
  title: string;
  children?: ReactNode;
  className?: string;
}

const toneClasses: Record<AlertProps['tone'], string> = {
  info: 'border-rule text-ink',
  warn: 'border-oxide/60 text-ink',
  error: 'border-oxide text-oxide',
};

export function Alert({ tone, title, children, className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-structure border-l-2 px-4 py-3', toneClasses[tone], className)}
    >
      <p className="text-[length:var(--t-small)] font-medium">{title}</p>
      {children && <div className="mt-1 text-[length:var(--t-small)] text-muted">{children}</div>}
    </div>
  );
}
