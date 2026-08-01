import { useState } from 'react';
import { cn } from './lib/utils';

export interface CopyButtonProps {
  value: string;
  className?: string;
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  // Copies through main rather than navigator.clipboard: this renderer is
  // sandboxed and loads from file://, where the async clipboard API is not
  // dependably available and failed silently (tech.md section 6, v4).
  const handleClick = async () => {
    await window.uplink.copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" onClick={() => void handleClick()} className={cn('btn', className)}>
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  );
}
