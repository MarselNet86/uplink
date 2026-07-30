import { useState } from 'react';
import type { ReactNode } from 'react';
import * as RadixCollapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';

export interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <RadixCollapsible.Root open={open} onOpenChange={setOpen}>
      <RadixCollapsible.Trigger className="flex items-center gap-1.5 text-[length:var(--t-small)] text-muted hover:text-ink">
        <ChevronRight
          size={13}
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
        />
        {title}
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content className="mt-2 border-l border-rule pl-3 font-mono text-[11px] text-muted">
        {children}
      </RadixCollapsible.Content>
    </RadixCollapsible.Root>
  );
}
