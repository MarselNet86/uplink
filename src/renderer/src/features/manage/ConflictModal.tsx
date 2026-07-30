import { useState } from 'react';
import type { ProtocolId, ProtocolStatus } from '@shared/types';
import { PlanBuilder } from '@shared/planBuilder';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Modal } from '../../ui/Modal';
import { PROTOCOL_TITLE, protocolMeta } from '../select/protocolCopy';

export interface ConflictModalProps {
  open: boolean;
  /** Protocols already found on the server (state !== 'absent'). */
  found: ProtocolStatus[];
  onClose: () => void;
  onRemove: (protocols: ProtocolId[]) => void;
  onReinstall: (protocols: ProtocolId[]) => void;
}

/**
 * Multi-select conflict modal (tech.md section 4): lists every found
 * protocol with a checkbox, one confirm action per outcome. Reinstall is
 * a full remove+install with new keys; remove only tears the protocol
 * down. Neither action is wired to a real pipeline yet (stage 5).
 */
export function ConflictModal({ open, found, onClose, onRemove, onReinstall }: ConflictModalProps) {
  const [selected, setSelected] = useState<Set<ProtocolId>>(
    () => new Set(found.map((f) => f.protocol)),
  );

  const toggle = (protocol: ProtocolId, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(protocol);
      else next.delete(protocol);
      return next;
    });
  };

  const targeted = PlanBuilder.buildRemovePlan(Array.from(selected), found);

  return (
    <Modal
      open={open}
      title="Протокол уже установлен на сервере"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            disabled={targeted.length === 0}
            onClick={() => onRemove(targeted)}
          >
            Удалить
          </Button>
          <Button
            variant="primary"
            disabled={targeted.length === 0}
            onClick={() => onReinstall(targeted)}
          >
            Переустановить
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 'var(--s2)' }}>
        Переустановка выдаст новые ключи, старые ссылки перестанут работать.
      </p>
      <div className="comp-stack">
        {found.map((status) => (
          <Checkbox
            key={status.protocol}
            checked={selected.has(status.protocol)}
            onCheckedChange={(checked) => toggle(status.protocol, checked)}
            label={PROTOCOL_TITLE[status.protocol]}
            description={protocolMeta(status.protocol, status.state)}
          />
        ))}
      </div>
    </Modal>
  );
}
