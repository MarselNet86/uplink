import type { ReactNode } from 'react';
import { cn } from './lib/utils';

export interface AlertProps {
  tone: 'info' | 'warn' | 'error';
  title: string;
  children?: ReactNode;
  className?: string;
}

const toneClass: Record<AlertProps['tone'], string> = {
  info: '',
  warn: 'alert--warn',
  error: 'alert--error',
};

export function Alert({ tone, title, children, className }: AlertProps) {
  return (
    <div role="alert" className={cn('alert', toneClass[tone], className)}>
      <p className="alert-title">{title}</p>
      {children && <p className="alert-body">{children}</p>}
    </div>
  );
}
