import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { HostKeyPromptEvent } from '@shared/schemas';

const pending = new Map<string, (accepted: boolean) => void>();

/**
 * Bridges SshSession's TOFU callback to the frozen hostkey:prompt /
 * hostkey:confirm IPC pair (tech.md section 6): sends the prompt to the
 * renderer and resolves once the matching hostkey:confirm invoke arrives.
 */
export function requestHostKeyConfirmation(
  win: BrowserWindow,
  info: { host: string; fingerprint: string; known: boolean },
): Promise<boolean> {
  const promptId = randomUUID();
  return new Promise((resolve) => {
    pending.set(promptId, resolve);
    const payload: HostKeyPromptEvent = { promptId, ...info };
    win.webContents.send(IPC.HOSTKEY_PROMPT, payload);
  });
}

/** Resolves a pending prompt; returns false if promptId is unknown/stale. */
export function resolveHostKeyPrompt(promptId: string, accepted: boolean): boolean {
  const resolve = pending.get(promptId);
  if (!resolve) return false;
  pending.delete(promptId);
  resolve(accepted);
  return true;
}
