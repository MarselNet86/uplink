import { useState } from 'react';
import { cn } from './lib/utils';

export interface CopyButtonProps {
  value: string;
  className?: string;
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" onClick={handleClick} className={cn('btn', className)}>
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  );
}
