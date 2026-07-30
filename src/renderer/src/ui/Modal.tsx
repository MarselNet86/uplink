import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(360px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-structure border border-rule bg-paper p-5 outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[length:var(--t-title)] font-normal">
              {title}
            </Dialog.Title>
            <Dialog.Close className="text-muted hover:text-ink" aria-label="Закрыть">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="mt-3 text-[length:var(--t-small)] text-muted">{children}</div>
          {footer && <div className="mt-5 flex justify-end gap-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
