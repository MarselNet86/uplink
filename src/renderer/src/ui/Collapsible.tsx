import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** +/- affordance, hairline top and bottom (design code 05). */
export function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="coll" data-open={open}>
      <button
        type="button"
        className="coll-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="coll-sign">{open ? '−' : '+'}</span>
      </button>
      <div id={panelId} className="coll-panel">
        {children}
      </div>
    </div>
  );
}
