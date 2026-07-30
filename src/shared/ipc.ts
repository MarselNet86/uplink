/** IPC channel names. Frozen contract - see tech.md section 6 (v2). */
export const IPC = {
  // renderer -> main, invoke
  SSH_CHECK: 'ssh:check',
  INSTALL_START: 'install:start',
  INSTALL_CANCEL: 'install:cancel',
  PROTOCOLS_REMOVE: 'protocols:remove',
  SESSION_CLOSE: 'session:close',
  HOSTKEY_CONFIRM: 'hostkey:confirm',
  // main -> renderer, send
  PROGRESS_EVENT: 'progress:event',
  HOSTKEY_PROMPT: 'hostkey:prompt',
} as const;

/**
 * Stage 0 skeleton-only wiring channel (tech.md roadmap section 15, stage 0).
 * Not part of the frozen domain contract above; removed once ssh:check lands in stage 2.
 */
export const DEMO_IPC = {
  DEMO_PING: 'demo:ping',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC] | (typeof DEMO_IPC)[keyof typeof DEMO_IPC];
