import { useEffect, useState } from 'react';
import type { AppError, CheckResult, DeployParams, ProtocolId } from '@shared/types';
import { useAppStore } from './store/useAppStore';
import { ErrorDetailsModal } from './features/common/ErrorDetailsModal';
import { KitchenSink } from './features/common/KitchenSink';
import { WizardShell } from './features/common/WizardShell';
import { ConnectForm } from './features/connect/ConnectForm';
import { HostKeyPromptModal } from './features/connect/HostKeyPromptModal';
import { InstallStep } from './features/install/InstallStep';
import { ConflictModal } from './features/manage/ConflictModal';
import { ResultStep } from './features/result/ResultStep';
import { SelectStep } from './features/select/SelectStep';

export default function App() {
  const route = useAppStore((state) => state.route);
  const setRoute = useAppStore((state) => state.setRoute);
  const checkResult = useAppStore((state) => state.checkResult);
  const setCheckResult = useAppStore((state) => state.setCheckResult);
  const deployParams = useAppStore((state) => state.deployParams);
  const setDeployParams = useAppStore((state) => state.setDeployParams);
  const run = useAppStore((state) => state.run);
  const startRun = useAppStore((state) => state.startRun);
  const setRunSteps = useAppStore((state) => state.setRunSteps);
  const setRunStep = useAppStore((state) => state.setRunStep);
  const setRunNote = useAppStore((state) => state.setRunNote);
  const finishRun = useAppStore((state) => state.finishRun);
  const resetRun = useAppStore((state) => state.resetRun);
  const fatalError = useAppStore((state) => state.fatalError);
  const setFatalError = useAppStore((state) => state.setFatalError);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(
    () =>
      window.uplink.onProgress((event) => {
        if (event.type === 'started') {
          startRun(event.runId);
          setRunSteps(event.steps);
        } else if (event.type === 'step') {
          setRunStep(event.stepId, event.status, event.percent);
        } else if (event.type === 'note') {
          setRunNote(event.message);
        } else {
          finishRun(event.result);
        }
      }),
    [startRun, setRunSteps, setRunStep, setRunNote, finishRun],
  );

  const foundProtocols = checkResult?.protocols.filter((p) => p.state !== 'absent') ?? [];

  const handleChecked = (result: CheckResult, params: DeployParams) => {
    setCheckResult(result);
    setDeployParams(params);
  };

  // These channels reject on a stale/missing session, which leaves the user
  // on step 2 with nothing to explain why nothing happened. Route the error
  // into the app-wide modal instead of dropping it.
  const handleInstall = async (protocols: ProtocolId[]) => {
    if (!checkResult || !deployParams) return;
    try {
      await window.uplink.installStart({
        sessionId: checkResult.sessionId,
        protocols,
        mode: 'install',
        params: deployParams,
      });
    } catch (err) {
      setFatalError({ error: err as AppError, context: 'Запуск установки' });
    }
  };

  const handleRemove = async (protocols: ProtocolId[]) => {
    if (!checkResult) return;
    setManageOpen(false);
    try {
      await window.uplink.protocolsRemove({ sessionId: checkResult.sessionId, protocols });
    } catch (err) {
      setFatalError({ error: err as AppError, context: 'Удаление протоколов' });
    }
  };

  const handleReinstall = async (protocols: ProtocolId[]) => {
    if (!checkResult || !deployParams) return;
    setManageOpen(false);
    try {
      await window.uplink.installStart({
        sessionId: checkResult.sessionId,
        protocols,
        mode: 'reinstall',
        params: deployParams,
      });
    } catch (err) {
      setFatalError({ error: err as AppError, context: 'Переустановка' });
    }
  };

  const handleDone = () => {
    resetRun();
    setCheckResult(null);
    setDeployParams(null);
  };

  const step = !checkResult ? 1 : !run ? 2 : !run.result ? 3 : 4;

  const caption =
    step === 1
      ? 'Собственный сервер, два протокола, ни одного ручного конфига. Домен не требуется.'
      : step === 2
        ? 'Reality занимает 443 по TCP, Hysteria2 — 443 по UDP. Ставятся вместе.'
        : step === 3
          ? 'Каждый шаг идемпотентен и проверяем перед переходом к следующему.'
          : run?.result?.outcomes.some((o) => o.ok && o.link)
            ? 'Сохраните ссылки сейчас — приложение их больше не покажет.'
            : 'Готово — можно вернуться и проверить сервер ещё раз.';

  return (
    <>
      <button
        type="button"
        className="eyebrow fixed right-2 top-2 z-50 cursor-pointer bg-transparent"
        onClick={() => setRoute(route === 'wizard' ? 'kitchen-sink' : 'wizard')}
      >
        {route === 'wizard' ? 'kitchen sink' : 'wizard'}
      </button>

      {route === 'kitchen-sink' && <KitchenSink />}

      {route === 'wizard' && (
        <WizardShell step={step} caption={caption}>
          {step === 1 && <ConnectForm onChecked={handleChecked} />}
          {step === 2 && checkResult && (
            <SelectStep
              result={checkResult}
              onBack={() => setCheckResult(null)}
              onManage={() => setManageOpen(true)}
              onInstall={(protocols) => void handleInstall(protocols)}
            />
          )}
          {step === 3 && <InstallStep />}
          {step === 4 && run?.result && <ResultStep result={run.result} onDone={handleDone} />}
        </WizardShell>
      )}

      {checkResult && (
        <ConflictModal
          open={manageOpen}
          found={foundProtocols}
          onClose={() => setManageOpen(false)}
          onRemove={(protocols) => void handleRemove(protocols)}
          onReinstall={(protocols) => void handleReinstall(protocols)}
        />
      )}

      <HostKeyPromptModal />

      <ErrorDetailsModal
        open={fatalError !== null}
        error={fatalError?.error ?? null}
        {...(fatalError ? { context: fatalError.context } : {})}
        onClose={() => setFatalError(null)}
      />
    </>
  );
}
