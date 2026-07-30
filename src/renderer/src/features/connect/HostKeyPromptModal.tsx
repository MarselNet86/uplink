import { useEffect, useState } from 'react';
import type { HostKeyPromptEvent } from '@shared/schemas';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';

/**
 * Listens for main-process hostkey:prompt events and renders the TOFU
 * confirmation modal (tech.md 5.1). Only fires for a genuinely new host:
 * a changed fingerprint is a hard stop (E_SSH_HOSTKEY_MISMATCH) handled
 * as a regular connect error, never routed through this prompt.
 */
export function HostKeyPromptModal() {
  const [prompt, setPrompt] = useState<HostKeyPromptEvent | null>(null);

  useEffect(() => window.uplink.onHostKeyPrompt(setPrompt), []);

  if (!prompt) return null;

  const respond = (accepted: boolean) => {
    void window.uplink.confirmHostKey({ promptId: prompt.promptId, accepted });
    setPrompt(null);
  };

  return (
    <Modal
      open
      title="Новый сервер"
      onClose={() => respond(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => respond(false)}>
            Отмена
          </Button>
          <Button variant="primary" onClick={() => respond(true)}>
            Доверять
          </Button>
        </>
      }
    >
      <p>{prompt.host}</p>
      <p className="mono mt-1 break-all text-ink">{prompt.fingerprint}</p>
    </Modal>
  );
}
