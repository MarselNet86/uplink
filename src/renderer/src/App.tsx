import { useEffect, useState } from 'react';
import type { AppError, CheckResult, DeployParams, ProtocolId } from '@shared/types';
import { useAppStore } from './store/useAppStore';
import { ErrorDetailsModal } from './features/common/ErrorDetailsModal';
import { WizardShell } from './features/common/WizardShell';
import { ConnectForm } from './features/connect/ConnectForm';
import { HostKeyPromptModal } from './features/connect/HostKeyPromptModal';
import { InstallStep } from './features/install/InstallStep';
import { ConflictModal } from './features/manage/ConflictModal';
import { ResultStep } from './features/result/ResultStep';
import { SelectStep } from './features/select/SelectStep';

export default function App() {
  const checkResult = useAppStore((state) => state.checkResult);
  const setCheckResult = useAppStore((state) => state.setCheckResult);
  const setProtocols = useAppStore((state) => state.setProtocols);
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
      setFatalError({ error: err as AppError, context: 'Starting installation' });
    }
  };

  const handleRemove = async (protocols: ProtocolId[]) => {
    if (!checkResult) return;
    setManageOpen(false);
    try {
      await window.uplink.protocolsRemove({ sessionId: checkResult.sessionId, protocols });
    } catch (err) {
      setFatalError({ error: err as AppError, context: 'Removing protocols' });
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
      setFatalError({ error: err as AppError, context: 'Reinstalling' });
    }
  };

  /**
   * Returns to protocol selection rather than the credentials form: the SSH
   * session is still open, so the only thing actually stale after a run is
   * the detected protocol list, which is refetched over that same session.
   * Falls back to step 1 only if the session is gone, since that is the one
   * case where re-entering credentials is genuinely required.
   */
  const handleDone = async () => {
    if (!checkResult) return;
    try {
      const protocols = await window.uplink.protocolsRefresh(checkResult.sessionId);
      setProtocols(protocols);
      resetRun();
    } catch {
      resetRun();
      setCheckResult(null);
      setDeployParams(null);
    }
  };

  // Abandoning step 2's session (going back to re-enter credentials) is the
  // one place nothing else already closes it - BUG-12: session:close was
  // never called from the renderer at all, so a session sat alive until its
  // own 5-minute idle timeout even after the user had already left it.
  const handleBack = () => {
    const sessionId = checkResult?.sessionId;
    setCheckResult(null);
    if (sessionId) void window.uplink.closeSession(sessionId).catch(() => {});
  };

  const step = !checkResult ? 1 : !run ? 2 : !run.result ? 3 : 4;

  return (
    <>
      {/* One persistent shell for every step - mounting a separate one for
          step 1 restarted the terminal canvas's growth animation on every
          transition into or out of it. */}
      <WizardShell step={step}>
        {step === 1 && <ConnectForm onChecked={handleChecked} />}
        {step === 2 && checkResult && (
          <SelectStep
            result={checkResult}
            onBack={handleBack}
            onManage={() => setManageOpen(true)}
            onInstall={(protocols) => void handleInstall(protocols)}
          />
        )}
        {step === 3 && <InstallStep />}
        {step === 4 && run?.result && (
          <ResultStep result={run.result} onDone={() => void handleDone()} />
        )}
      </WizardShell>

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
