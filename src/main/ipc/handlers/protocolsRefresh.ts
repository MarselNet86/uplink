import type { IpcMainInvokeEvent } from 'electron';
import { protocolsRefreshRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type { AppError, ProtocolStatus } from '@shared/types';
import { ProtocolDetector } from '../../domain/ProtocolDetector';
import { TokenExtractor } from '../../domain/TokenExtractor';
import { getSession, getSessionHost } from '../../ssh/sessionRegistry';

/**
 * Re-detects installed protocols on an already-open session (tech.md
 * section 6, v4). After an install or a remove the server state has changed,
 * but the renderer still holds the ProtocolStatus[] from ssh:check. Rather
 * than send the user back to step 1 to re-enter credentials just to refresh
 * that list, the select step asks for a fresh reading over the live session.
 * Token extraction runs on the same refresh so the returned list always
 * carries connection links for installed protocols, matching ssh:check behaviour.
 */
export async function handleProtocolsRefresh(
  _event: IpcMainInvokeEvent,
  payload: unknown,
): Promise<ProtocolStatus[]> {
  const { sessionId } = protocolsRefreshRequestSchema.parse(payload);
  const session = getSession(sessionId);
  if (!session) {
    const appError: AppError = {
      code: 'E_UNKNOWN',
      message: 'сессия не найдена, повторите проверку сервера',
    };
    throw new Error(encodeAppError(appError));
  }
  const runner = session.getCommandRunner();
  const host = getSessionHost(sessionId) ?? '';
  const raw = await new ProtocolDetector(runner).detect();
  return new TokenExtractor(runner, host).enrichWithLinks(raw);
}
