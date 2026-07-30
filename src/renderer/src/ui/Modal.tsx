import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

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
        <Dialog.Overlay className="modal-scrim" data-open="true">
          <Dialog.Content className="modal" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            {children && <Dialog.Description className="modal-body">{children}</Dialog.Description>}
            {footer && <div className="modal-foot">{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
