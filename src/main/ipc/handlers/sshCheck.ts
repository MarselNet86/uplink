import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { checkRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type { AppError, CheckItem, CheckRequest, CheckResult } from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import { UnsupportedArchError, UnsupportedDistroError } from '../../domain/DistroDetector';
import { Preflight } from '../../domain/Preflight';
import { ProtocolDetector } from '../../domain/ProtocolDetector';
import { TokenExtractor } from '../../domain/TokenExtractor';
import { HostKeyStore } from '../../ssh/HostKeyStore';
import { SshConnectError, SshSession } from '../../ssh/SshSession';
import { registerSession } from '../../ssh/sessionRegistry';
import { requestHostKeyConfirmation } from '../hostKeyPrompts';

const TCP_TIMEOUT_MS = 5_000;

function throwAppError(code: ErrorCode, message: string, hint?: string): never {
  const appError: AppError = hint ? { code, message, hint } : { code, message };
  throw new Error(encodeAppError(appError));
}

function checkTcp(host: string, port: number): Promise<CheckItem> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: TCP_TIMEOUT_MS });
    let settled = false;
    const finish = (item: CheckItem) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(item);
    };
    socket.once('connect', () => finish({ id: 'tcp', status: 'ok' }));
    socket.once('timeout', () =>
      finish({ id: 'tcp', status: 'fail', detail: 'таймаут подключения' }),
    );
    socket.once('error', (err) => finish({ id: 'tcp', status: 'fail', detail: err.message }));
  });
}

export async function handleSshCheck(
  event: IpcMainInvokeEvent,
  payload: unknown,
): Promise<CheckResult> {
  // zod's inferred optional fields (`domain?: string | undefined`) are a
  // strictly wider type than DeployParams under exactOptionalPropertyTypes;
  // the schema already guarantees the shape matches.
  const { credentials, params } = checkRequestSchema.parse(payload) as CheckRequest;

  const tcpItem = await checkTcp(credentials.host, credentials.port);
  if (tcpItem.status !== 'ok') {
    throwAppError('E_NET_UNREACHABLE', 'Сервер недоступен по TCP', tcpItem.detail);
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const hostKeyStore = new HostKeyStore(join(app.getPath('userData'), 'known_hosts.json'));

  let session: SshSession;
  try {
    session = await SshSession.connect(credentials, hostKeyStore, (prompt) => {
      if (!win) return Promise.resolve(false);
      return requestHostKeyConfirmation(win, {
        host: prompt.host,
        fingerprint: prompt.fingerprint,
        known: false,
      });
    });
  } catch (err) {
    if (err instanceof SshConnectError) throwAppError(err.code, err.message);
    throwAppError('E_UNKNOWN', err instanceof Error ? err.message : 'unknown ssh error');
  }

  const runner = session.getCommandRunner();
  let preflightItems: CheckItem[];
  let distro: CheckResult['distro'];
  let protocols: CheckResult['protocols'];
  try {
    const [preflightResult, rawProtocols] = await Promise.all([
      new Preflight(runner).run(params, credentials.host),
      new ProtocolDetector(runner).detect(),
    ]);
    preflightItems = preflightResult.items;
    distro = preflightResult.distro;
    protocols = await new TokenExtractor(runner, credentials.host).enrichWithLinks(rawProtocols);
  } catch (err) {
    session.dispose();
    if (err instanceof UnsupportedDistroError) {
      throwAppError('E_DISTRO_UNSUPPORTED', `unsupported distro: ${err.rawId}`);
    }
    if (err instanceof UnsupportedArchError) {
      throwAppError('E_ARCH_UNSUPPORTED', `unsupported architecture: ${err.rawArch}`);
    }
    throwAppError('E_UNKNOWN', err instanceof Error ? err.message : 'unknown preflight error');
  }

  const items: CheckItem[] = [tcpItem, { id: 'auth', status: 'ok' }, ...preflightItems];
  const passed = items.every((item) => item.status !== 'fail');

  const sessionId = randomUUID();
  registerSession(sessionId, session, credentials.host);

  return {
    sessionId,
    distro,
    preflight: { items, passed },
    protocols,
  };
}
