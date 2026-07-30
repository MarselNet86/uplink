import { useEffect, useState } from 'react';
import type { HostKeyPromptEvent } from '@shared/schemas';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';

/**
 * Listens for main-process hostkey:prompt events (TOFU flow, tech.md 5.1)
 * and renders the fingerprint confirmation modal. Mounted once at the app
 * root; stays inert until a real ssh:check triggers a prompt (stage 2+).
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
      title={prompt.known ? 'Отпечаток сервера изменился' : 'Новый сервер'}
      onClose={() => respond(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => respond(false)}>
            Отмена
          </Button>
          <Button variant={prompt.known ? 'danger' : 'primary'} onClick={() => respond(true)}>
            {prompt.known ? 'Всё равно доверять' : 'Доверять'}
          </Button>
        </>
      }
    >
      <p>{prompt.host}</p>
      <p className="mt-1 break-all font-mono text-[11px] text-ink">{prompt.fingerprint}</p>
      {prompt.known && (
        <p className="mt-2 text-oxide">
          Это может означать подмену сервера (MITM) либо переустановку ОС на прежнем IP.
        </p>
      )}
    </Modal>
  );
}
