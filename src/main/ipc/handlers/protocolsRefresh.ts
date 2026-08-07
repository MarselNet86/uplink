import type { IpcMainInvokeEvent } from 'electron';
import { protocolsRefreshRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type { AppError, DeployParams, RefreshResult } from '@shared/types';
import { Preflight } from '../../domain/Preflight';
import { ProtocolDetector } from '../../domain/ProtocolDetector';
import { TokenExtractor } from '../../domain/TokenExtractor';
import { getSession, getSessionHost } from '../../ssh/sessionRegistry';

/**
 * Re-reads the server state on an already-open session (tech.md section 6,
 * v6). After an install or a remove the renderer still holds the snapshot
 * from ssh:check. Rather than send the user back to step 1 to re-enter
 * credentials just to refresh it, the select step asks for a fresh reading
 * over the live session.
 *
 * Preflight is re-run alongside the protocol list because it goes stale in
 * exactly the same way: after removing a protocol its port is free again,
 * but the old report still showed it busy, and SelectStep gates the Install
 * button on `preflight.passed` - so step 2 became a dead end with no way to
 * clear it except reconnecting. Token extraction runs here too, so the
 * returned list always carries connection links for installed protocols,
 * matching ssh:check behaviour.
 */
export async function handleProtocolsRefresh(
  _event: IpcMainInvokeEvent,
  payload: unknown,
): Promise<RefreshResult> {
  // zod's inferred optional fields are strictly wider than DeployParams
  // under exactOptionalPropertyTypes; the schema already pins the shape.
  const { sessionId, params } = protocolsRefreshRequestSchema.parse(payload) as {
    sessionId: string;
    params: DeployParams;
  };
  const session = getSession(sessionId);
  if (!session) {
    const appError: AppError = {
      code: 'E_UNKNOWN',
      message: 'session not found, please check the server again',
    };
    throw new Error(encodeAppError(appError));
  }
  const runner = session.getCommandRunner();
  const host = getSessionHost(sessionId) ?? '';

  const raw = await new ProtocolDetector(runner).detect();
  const protocols = await new TokenExtractor(runner, host).enrichWithLinks(raw);

  const { items } = await new Preflight(runner).run(params, host);
  const passed = items.every((item) => item.status !== 'fail');

  return { preflight: { items, passed }, protocols };
}
