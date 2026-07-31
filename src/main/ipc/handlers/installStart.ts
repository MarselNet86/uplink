import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import { installRequestSchema } from '@shared/schemas';
import { encodeAppError } from '@shared/ipcError';
import type {
  AppError,
  DeployParams,
  InstallRequest,
  ProtocolId,
  ProtocolOutcome,
  RunHandle,
  RunResult,
  StepId,
  StepStatus,
} from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import type { SshSession } from '../../ssh/SshSession';
import { getSession } from '../../ssh/sessionRegistry';
import { BaseInstaller } from '../../domain/installers/BaseInstaller';
import { Hysteria2Installer } from '../../domain/installers/Hysteria2Installer';
import { XrayRealityInstaller } from '../../domain/installers/XrayRealityInstaller';
import { Pipeline } from '../../pipeline/Pipeline';
import { ProgressReporter } from '../../pipeline/ProgressReporter';
import { redact } from '../../security/redact';
import type { IProgressSink, Step } from '../../pipeline/Step';
import { clearRun, createCancelToken } from '../../pipeline/runRegistry';

/**
 * Fixed left-to-right order the combined step list is built in, regardless
 * of the order protocols were selected in - keeps `installers[0]` a stable
 * "which config step comes first" answer for the point of no return.
 */
const PROTOCOL_ORDER: ProtocolId[] = ['vless-reality', 'hysteria2'];

const INSTALLER_FACTORIES: Partial<
  Record<ProtocolId, (session: SshSession, host: string, params: DeployParams) => BaseInstaller>
> = {
  'vless-reality': (session, host) =>
    new XrayRealityInstaller(session.getCommandRunner(), session.getFileTransfer(), host),
  hysteria2: (session, host, params) =>
    new Hysteria2Installer(session.getCommandRunner(), session.getFileTransfer(), host, params),
};

function throwAppError(code: ErrorCode, message: string): never {
  const appError: AppError = { code, message };
  throw new Error(encodeAppError(appError));
}

/**
 * H1/X1 share the StepId `base-packages` (tech.md 5.7 H1: "шаг общий,
 * выполняется один раз на прогон"). When both protocols are selected their
 * buildSteps() each contribute a `base-packages` entry; merge them into one
 * StepView that runs both installers' prepare() in sequence, so the step
 * list never shows the same id twice and neither installer's own package
 * needs (e.g. Hysteria2's openssl check) get silently dropped.
 */
function mergeStepsById(steps: Step[]): Step[] {
  const order: StepId[] = [];
  const merged = new Map<StepId, Step>();
  for (const step of steps) {
    const existing = merged.get(step.id);
    if (!existing) {
      merged.set(step.id, step);
      order.push(step.id);
      continue;
    }
    const runBoth = existing.run;
    merged.set(step.id, {
      ...existing,
      run: async (ctx) => {
        await runBoth(ctx);
        await step.run(ctx);
      },
    });
  }
  return order.map((id) => merged.get(id)).filter((s): s is Step => s !== undefined);
}

/**
 * Wraps the real sink to track which installers are "in flight" - past
 * their own config-write step but not yet past their own verify step -
 * so a cancellation past the run's point of no return only rolls back
 * protocols genuinely interrupted mid-install, never one that already
 * finished or one that never started (tech.md 5.12).
 */
class InstallerTrackingSink implements IProgressSink {
  private readonly configStepOf = new Map<StepId, BaseInstaller>();
  private readonly verifyStepOf = new Map<StepId, BaseInstaller>();
  private readonly inFlight = new Set<BaseInstaller>();
  private readonly completed = new Set<BaseInstaller>();

  constructor(
    private readonly inner: IProgressSink,
    installers: BaseInstaller[],
  ) {
    for (const installer of installers) {
      this.configStepOf.set(installer.getConfigStepId(), installer);
      this.verifyStepOf.set(installer.getVerifyStepId(), installer);
    }
  }

  onStepStatus(stepId: StepId, status: StepStatus): void {
    if (status === 'done') {
      const startedInstaller = this.configStepOf.get(stepId);
      if (startedInstaller) this.inFlight.add(startedInstaller);
      const finishedInstaller = this.verifyStepOf.get(stepId);
      if (finishedInstaller) {
        this.inFlight.delete(finishedInstaller);
        this.completed.add(finishedInstaller);
      }
    }
    this.inner.onStepStatus(stepId, status);
  }

  onNote(message: string): void {
    this.inner.onNote(message);
  }

  get inFlightInstallers(): BaseInstaller[] {
    return [...this.inFlight];
  }

  /** Installers whose own verify step already reached "done" before the run stopped. */
  get completedInstallers(): BaseInstaller[] {
    return [...this.completed];
  }
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

  const steps = mergeStepsById([preflightStep, ...installers.flatMap((i) => i.buildSteps())]);
  const primaryInstaller = installers[0];
  const pointOfNoReturn = primaryInstaller?.getConfigStepId();

  const reporter = new ProgressReporter(
    steps.map((s) => ({ id: s.id, title: s.title, weight: s.weight })),
    runId,
    (progressEvent) => {
      if (win && !win.isDestroyed()) win.webContents.send(IPC.PROGRESS_EVENT, progressEvent);
    },
  );
  const trackingSink = new InstallerTrackingSink(reporter, installers);
  const rollback =
    installers.length > 0
      ? async () => {
          for (const installer of trackingSink.inFlightInstallers) await installer.rollback();
        }
      : undefined;

  reporter.start();
  const pipelineResult = await new Pipeline(
    steps,
    trackingSink,
    cancelToken,
    pointOfNoReturn,
    rollback,
  ).run();

  const warnings = installers.flatMap((i) => i.getWarnings());
  let outcomes: ProtocolOutcome[];
  let diagnostics: string | undefined;

  const completedInstallers = new Set(trackingSink.completedInstallers);

  if (pipelineResult.status === 'completed') {
    outcomes = installers.map((i) => i.getOutcome());
  } else if (pipelineResult.status === 'cancelled') {
    // A protocol that already reached its own verify step keeps its result
    // even if a later protocol in the same run was the one cancelled
    // mid-flight (tech.md 5.12: an already-installed protocol never rolls
    // back because a different one failed or was interrupted).
    outcomes = installers.map((i) =>
      completedInstallers.has(i)
        ? i.getOutcome()
        : {
            protocol: i.protocolId,
            ok: false,
            error: { code: 'E_CANCELLED', message: 'Установка отменена пользователем' },
          },
    );
  } else {
    diagnostics = redact(String(pipelineResult.error));
    outcomes = installers.map((i) => {
      if (completedInstallers.has(i)) return i.getOutcome();
      if (i.ownsStep(pipelineResult.stepId)) {
        return { protocol: i.protocolId, ok: false, error: i.toAppError(pipelineResult.error) };
      }
      return {
        protocol: i.protocolId,
        ok: false,
        error: { code: 'E_CANCELLED', message: 'Пропущено из-за ошибки другого протокола' },
      };
    });
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
