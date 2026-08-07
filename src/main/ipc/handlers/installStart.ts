import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import { installRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type {
  AppError,
  CheckId,
  DeployParams,
  InstallRequest,
  ProtocolId,
  RunHandle,
} from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import type { SshSession } from '../../ssh/SshSession';
import { getSession } from '../../ssh/sessionRegistry';
import { BaseInstaller } from '../../domain/installers/BaseInstaller';
import { Hysteria2Installer } from '../../domain/installers/Hysteria2Installer';
import { InstallerError } from '../../domain/installers/InstallerError';
import { XrayRealityInstaller } from '../../domain/installers/XrayRealityInstaller';
import { Preflight } from '../../domain/Preflight';
import { ProtocolDetector } from '../../domain/ProtocolDetector';
import { BaseRemover } from '../../domain/removers/BaseRemover';
import { Hysteria2Remover } from '../../domain/removers/Hysteria2Remover';
import { XrayRemover } from '../../domain/removers/XrayRemover';
import { Pipeline } from '../../pipeline/Pipeline';
import { ProgressReporter } from '../../pipeline/ProgressReporter';
import type { Step } from '../../pipeline/Step';
import { claimSessionRun, clearRun, createCancelToken } from '../../pipeline/runRegistry';
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
  'vless-reality': (session, host, params) =>
    new XrayRealityInstaller(session.getCommandRunner(), session.getFileTransfer(), host, params),
  hysteria2: (session, host, params) =>
    new Hysteria2Installer(session.getCommandRunner(), session.getFileTransfer(), host, params),
};

const REMOVER_FACTORIES: Partial<
  Record<ProtocolId, (session: SshSession, host: string) => BaseRemover>
> = {
  'vless-reality': (session, host) => new XrayRemover(session.getCommandRunner(), host),
  hysteria2: (session, host) => new Hysteria2Remover(session.getCommandRunner(), host),
};

/**
 * Maps a failed preflight CheckId to its ErrorCode (BUG-02/BUG-23): only
 * the checks that can genuinely fail here (tech.md 5.4 items 3, 6-10 -
 * distro/arch never produce 'fail', tcp/auth are resolved before a runner
 * even exists) need an entry.
 */
const PREFLIGHT_ERROR_CODES: Partial<Record<CheckId, ErrorCode>> = {
  privileges: 'E_NO_SUDO',
  systemd: 'E_NO_SYSTEMD',
  outbound: 'E_NO_OUTBOUND',
  ports: 'E_PORT_BUSY',
  dns: 'E_DNS_MISMATCH',
  'apt-lock': 'E_APT_LOCKED',
};

function throwAppError(code: ErrorCode, message: string): never {
  const appError: AppError = { code, message };
  throw new Error(encodeAppError(appError));
}

/**
 * Refuses to start an install against a protocol the server doesn't
 * actually report as `absent` (BUG-23: E_ALREADY_INSTALLED/E_FOREIGN_CONFIG
 * were declared in the error contract but never reachable - the only
 * enforcement was the renderer disabling the checkbox, tech.md 5.5's own
 * `PlanBuilder` rule was never re-checked server-side). Reinstall is
 * exempt: it exists precisely to act on a protocol that is already there.
 */
async function assertInstallable(session: SshSession, protocols: ProtocolId[]): Promise<void> {
  const statuses = await new ProtocolDetector(session.getCommandRunner()).detect();
  for (const protocol of protocols) {
    const status = statuses.find((s) => s.protocol === protocol);
    if (status?.state === 'foreign') {
      throwAppError(
        'E_FOREIGN_CONFIG',
        `${protocol} has a foreign, unmanaged config on the server`,
      );
    }
    if (status && status.state !== 'absent') {
      throwAppError('E_ALREADY_INSTALLED', `${protocol} is already present on the server`);
    }
  }
}

export async function handleInstallStart(
  event: IpcMainInvokeEvent,
  payload: unknown,
): Promise<RunHandle> {
  const request = installRequestSchema.parse(payload) as InstallRequest;
  const session = getSession(request.sessionId);
  if (!session) {
    throwAppError('E_UNKNOWN', 'session not found, please check the server again');
  }

  // Claimed before the assertInstallable round-trip below, not after: that
  // await is exactly the window a second click slips through, since the
  // renderer does not leave step 2 until the first progress event lands.
  // A repeated click is the same request, so it gets the same RunHandle
  // rather than an error or a second pipeline over one SSH session.
  const runId = randomUUID();
  const active = claimSessionRun(request.sessionId, runId);
  if (active !== undefined) return { runId: active };

  try {
    if (request.mode === 'install') {
      await assertInstallable(session, request.protocols);
    }
  } catch (err) {
    // Nothing was started, so the claim has to go back - otherwise a rejected
    // install would wedge the session until the user reconnects.
    clearRun(runId);
    throw err;
  }

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

  // Re-runs the preflight checks (tech.md 5.4) rather than trusting the
  // ssh:check snapshot from earlier in the session: server state (a port,
  // apt lock, systemd) can change in the time the user spends on step 2,
  // and this is also the only server-side enforcement of a failed check -
  // previously a no-op, so a failed preflight never actually blocked
  // installation (BUG-02) and four of its ErrorCodes were unreachable
  // dead code (BUG-23).
  const preflightStep: Step = {
    id: 'preflight',
    title: 'Checking server',
    weight: 5,
    critical: true,
    run: async () => {
      const { items } = await new Preflight(session.getCommandRunner()).run(request.params, host);
      const failed = items.find((item) => item.status === 'fail');
      if (failed) {
        const code = PREFLIGHT_ERROR_CODES[failed.id] ?? 'E_UNKNOWN';
        throw new InstallerError(code, failed.detail ?? `${failed.id} check failed`);
      }
    },
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
