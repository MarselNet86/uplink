import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import { removeRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type { AppError, ProtocolId, RemoveRequest, RunHandle } from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import type { SshSession } from '../../ssh/SshSession';
import { getSession } from '../../ssh/sessionRegistry';
import { BaseRemover } from '../../domain/removers/BaseRemover';
import { Hysteria2Remover } from '../../domain/removers/Hysteria2Remover';
import { XrayRemover } from '../../domain/removers/XrayRemover';
import { Pipeline } from '../../pipeline/Pipeline';
import { ProgressReporter } from '../../pipeline/ProgressReporter';
import { claimSessionRun, clearRun, createCancelToken } from '../../pipeline/runRegistry';
import {
  PROTOCOL_ORDER,
  RunTrackingSink,
  asRemoverUnit,
  buildBackupStep,
  buildRollback,
  buildRunResult,
  mergeStepsById,
} from '../runOrchestration';

const REMOVER_FACTORIES: Partial<
  Record<ProtocolId, (session: SshSession, host: string) => BaseRemover>
> = {
  'vless-reality': (session, host) => new XrayRemover(session.getCommandRunner(), host),
  hysteria2: (session, host) => new Hysteria2Remover(session.getCommandRunner(), host),
};

function throwAppError(code: ErrorCode, message: string): never {
  const appError: AppError = { code, message };
  throw new Error(encodeAppError(appError));
}

export function handleProtocolsRemove(event: IpcMainInvokeEvent, payload: unknown): RunHandle {
  const request = removeRequestSchema.parse(payload) as RemoveRequest;
  const session = getSession(request.sessionId);
  if (!session) {
    throwAppError('E_UNKNOWN', 'session not found, please check the server again');
  }

  // Same one-run-per-session rule as install:start - a double-clicked Remove
  // gets the RunHandle already in flight instead of a second pipeline.
  const runId = randomUUID();
  const active = claimSessionRun(request.sessionId, runId);
  if (active !== undefined) return { runId: active };

  const win = BrowserWindow.fromWebContents(event.sender);
  const cancelToken = createCancelToken(runId);

  void runRemove(request, session, runId, win, cancelToken).finally(() => clearRun(runId));

  return { runId };
}

async function runRemove(
  request: RemoveRequest,
  session: SshSession,
  runId: string,
  win: Electron.BrowserWindow | null,
  cancelToken: ReturnType<typeof createCancelToken>,
): Promise<void> {
  const host = session.getHost();

  const supported = PROTOCOL_ORDER.filter(
    (p) => request.protocols.includes(p) && p in REMOVER_FACTORIES,
  );
  const unsupported = request.protocols.filter((p) => !(p in REMOVER_FACTORIES));

  const removers = supported.map((protocol) => {
    const factory = REMOVER_FACTORIES[protocol];
    if (!factory) throw new Error(`no remover factory for ${protocol}`);
    return factory(session, host);
  });

  const backupStep = buildBackupStep(
    session.getCommandRunner(),
    removers.flatMap((r) => r.getConfigPaths()),
  );
  const steps = mergeStepsById([backupStep, ...removers.map((r) => r.buildStep())]);
  const units = removers.map(asRemoverUnit);
  const pointOfNoReturn = units[0]?.startStepId;

  const reporter = new ProgressReporter(
    steps.map((s) => ({ id: s.id, title: s.title, weight: s.weight })),
    runId,
    (progressEvent) => {
      if (win && !win.isDestroyed()) win.webContents.send(IPC.PROGRESS_EVENT, progressEvent);
    },
  );
  const trackingSink = new RunTrackingSink(reporter, units);

  reporter.start();
  const pipelineResult = await new Pipeline(
    steps,
    trackingSink,
    cancelToken,
    pointOfNoReturn,
    buildRollback(trackingSink),
  ).run();

  const warnings = removers.flatMap((r) => r.getWarnings());
  const result = buildRunResult(runId, pipelineResult, units, trackingSink, unsupported, warnings);
  reporter.finish(result);
}
