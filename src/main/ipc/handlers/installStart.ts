import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import { installRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type { AppError, DeployParams, InstallRequest, ProtocolId, RunHandle } from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import type { SshSession } from '../../ssh/SshSession';
import { getSession } from '../../ssh/sessionRegistry';
import { BaseInstaller } from '../../domain/installers/BaseInstaller';
import { Hysteria2Installer } from '../../domain/installers/Hysteria2Installer';
import { XrayRealityInstaller } from '../../domain/installers/XrayRealityInstaller';
import { BaseRemover } from '../../domain/removers/BaseRemover';
import { Hysteria2Remover } from '../../domain/removers/Hysteria2Remover';
import { XrayRemover } from '../../domain/removers/XrayRemover';
import { Pipeline } from '../../pipeline/Pipeline';
import { ProgressReporter } from '../../pipeline/ProgressReporter';
import type { Step } from '../../pipeline/Step';
import { clearRun, createCancelToken } from '../../pipeline/runRegistry';
import {
  PROTOCOL_ORDER,
  RunTrackingSink,
  asInstallerUnit,
  asReinstallUnit,
  buildBackupStep,
  buildRollback,
  buildRunResult,
  mergeStepsById,
} from '../runOrchestration';
import type { TrackableUnit } from '../runOrchestration';

const INSTALLER_FACTORIES: Partial<
  Record<ProtocolId, (session: SshSession, host: string, params: DeployParams) => BaseInstaller>
> = {
  'vless-reality': (session, host) =>
    new XrayRealityInstaller(session.getCommandRunner(), session.getFileTransfer(), host),
  hysteria2: (session, host, params) =>
    new Hysteria2Installer(session.getCommandRunner(), session.getFileTransfer(), host, params),
};

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

export function handleInstallStart(event: IpcMainInvokeEvent, payload: unknown): RunHandle {
  const request = installRequestSchema.parse(payload) as InstallRequest;
  const session = getSession(request.sessionId);
  if (!session) {
    throwAppError('E_UNKNOWN', 'сессия не найдена, повторите проверку сервера');
  }

  const runId = randomUUID();
  const win = BrowserWindow.fromWebContents(event.sender);
  const cancelToken = createCancelToken(runId);

  void runInstall(request, session, runId, win, cancelToken).finally(() => clearRun(runId));

  return { runId };
}

async function runInstall(
  request: InstallRequest,
  session: SshSession,
  runId: string,
  win: Electron.BrowserWindow | null,
  cancelToken: ReturnType<typeof createCancelToken>,
): Promise<void> {
  const host = session.getHost();

  const supported = PROTOCOL_ORDER.filter(
    (p) => request.protocols.includes(p) && p in INSTALLER_FACTORIES,
  );
  const unsupported = request.protocols.filter((p) => !(p in INSTALLER_FACTORIES));

  const installers = supported.map((protocol) => {
    const factory = INSTALLER_FACTORIES[protocol];
    if (!factory) throw new Error(`no installer factory for ${protocol}`);
    return factory(session, host, request.params);
  });

  const isReinstall = request.mode === 'reinstall';

  // Already validated at ssh:check within this same session (tech.md 5.4);
  // this step exists purely so the progress bar/step list account for it,
  // matching the weight table in tech.md 5.11.
  const preflightStep: Step = {
    id: 'preflight',
    title: 'Проверка сервера',
    weight: 5,
    critical: true,
    run: async () => {},
  };

  let steps: Step[];
  let units: TrackableUnit[];

  if (isReinstall) {
    // Reinstall = remove + install in one pipeline with shared progress
    // (tech.md 5.10): each protocol's remover step runs immediately before
    // its own installer steps, and the two collapse into a single
    // TrackableUnit so the run reports one outcome per protocol.
    const removers = supported.map((protocol) => {
      const factory = REMOVER_FACTORIES[protocol];
      if (!factory) throw new Error(`no remover factory for ${protocol}`);
      return factory(session, host);
    });
    const pairs = removers.map((remover, index) => {
      const installer = installers[index];
      if (!installer) throw new Error(`installer/remover count mismatch for ${remover.protocolId}`);
      return { remover, installer };
    });
    const backupStep = buildBackupStep(
      session.getCommandRunner(),
      removers.flatMap((r) => r.getConfigPaths()),
    );
    steps = mergeStepsById([
      preflightStep,
      backupStep,
      ...pairs.flatMap(({ remover, installer }) => [
        remover.buildStep(),
        ...installer.buildSteps(),
      ]),
    ]);
    units = pairs.map(({ remover, installer }) => asReinstallUnit(remover, installer));
  } else {
    steps = mergeStepsById([preflightStep, ...installers.flatMap((i) => i.buildSteps())]);
    units = installers.map(asInstallerUnit);
  }

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

  const warnings = installers.flatMap((i) => i.getWarnings());
  const result = buildRunResult(runId, pipelineResult, units, trackingSink, unsupported, warnings);
  reporter.finish(result);
}
