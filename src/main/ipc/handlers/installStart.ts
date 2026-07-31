import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import { installRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type {
  AppError,
  InstallRequest,
  ProtocolId,
  ProtocolOutcome,
  RunHandle,
  RunResult,
} from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import type { SshSession } from '../../ssh/SshSession';
import { getSession } from '../../ssh/sessionRegistry';
import { BaseInstaller } from '../../domain/installers/BaseInstaller';
import { XrayRealityInstaller } from '../../domain/installers/XrayRealityInstaller';
import { Pipeline } from '../../pipeline/Pipeline';
import { ProgressReporter } from '../../pipeline/ProgressReporter';
import { redact } from '../../security/redact';
import type { Step } from '../../pipeline/Step';
import { clearRun, createCancelToken } from '../../pipeline/runRegistry';

/** Protocols with a real installer today; others fall back to a plain "not available yet" outcome (Hysteria2 lands in stage 6). */
const INSTALLER_FACTORIES: Partial<
  Record<ProtocolId, (session: SshSession, host: string) => BaseInstaller>
> = {
  'vless-reality': (session, host) =>
    new XrayRealityInstaller(session.getCommandRunner(), session.getFileTransfer(), host),
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

  const supported = request.protocols.filter((p) => p in INSTALLER_FACTORIES);
  const unsupported = request.protocols.filter((p) => !(p in INSTALLER_FACTORIES));

  const installers = supported.map((protocol) => {
    const factory = INSTALLER_FACTORIES[protocol];
    if (!factory) throw new Error(`no installer factory for ${protocol}`);
    return factory(session, host);
  });

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

  const steps: Step[] = [preflightStep, ...installers.flatMap((i) => i.buildSteps())];
  const primaryInstaller = installers[0];
  const pointOfNoReturn = primaryInstaller?.getConfigStepId();
  const rollback = primaryInstaller ? () => primaryInstaller.rollback() : undefined;

  const reporter = new ProgressReporter(
    steps.map((s) => ({ id: s.id, title: s.title, weight: s.weight })),
    runId,
    (progressEvent) => {
      if (win && !win.isDestroyed()) win.webContents.send(IPC.PROGRESS_EVENT, progressEvent);
    },
  );

  reporter.start();
  const pipelineResult = await new Pipeline(
    steps,
    reporter,
    cancelToken,
    pointOfNoReturn,
    rollback,
  ).run();

  const warnings = installers.flatMap((i) => i.getWarnings());
  let outcomes: ProtocolOutcome[];
  let diagnostics: string | undefined;

  if (pipelineResult.status === 'completed') {
    outcomes = installers.map((i) => i.getOutcome());
  } else if (pipelineResult.status === 'cancelled') {
    outcomes = installers.map((i) => ({
      protocol: i.protocolId,
      ok: false,
      error: { code: 'E_CANCELLED', message: 'Установка отменена пользователем' },
    }));
  } else {
    diagnostics = redact(String(pipelineResult.error));
    outcomes = installers.map((i) =>
      i.ownsStep(pipelineResult.stepId)
        ? { protocol: i.protocolId, ok: false, error: i.toAppError(pipelineResult.error) }
        : {
            protocol: i.protocolId,
            ok: false,
            error: { code: 'E_CANCELLED', message: 'Пропущено из-за ошибки другого протокола' },
          },
    );
  }

  const notAvailable: ProtocolOutcome[] = unsupported.map((protocol) => ({
    protocol,
    ok: false,
    error: { code: 'E_UNKNOWN', message: 'Протокол пока не поддерживается' },
  }));

  const result: RunResult = {
    runId,
    ok: outcomes.some((o) => o.ok),
    outcomes: [...outcomes, ...notAvailable],
    warnings,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };

  reporter.finish(result);
}
