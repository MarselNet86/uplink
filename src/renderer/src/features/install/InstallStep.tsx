import { useState } from 'react';
import type { StepView } from '@shared/types';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Collapsible } from '../../ui/Collapsible';
import { ProgressBar } from '../../ui/ProgressBar';
import { StepList } from '../../ui/StepList';
import { useAppStore } from '../../store/useAppStore';

/**
 * Step 3 (tech.md section 4): a single shared progress bar plus a step
 * list, both driven purely by `progress:event` - the renderer never polls.
 * Cancel stays enabled until the run finishes; the pipeline itself decides
 * whether that cancellation is instant or deferred (tech.md 5.12), the UI
 * only reflects "cancelling..." once the click has been sent. App.tsx
 * switches to step 4 on its own once `run.result` is set.
 */
export function InstallStep() {
  const run = useAppStore((state) => state.run);
  const [cancelling, setCancelling] = useState(false);

  if (!run) return null;

  const currentStep: StepView | undefined = [...run.steps]
    .reverse()
    .find((step) => step.status === 'running');
  const stage = currentStep?.title ?? 'Установка';
  const failed = run.steps.some((step) => step.status === 'failed');

  const handleCancel = () => {
    setCancelling(true);
    void window.uplink.installCancel(run.runId);
  };

  return (
    <>
      <div>
        <h3 className="split-h">Установка</h3>
        <p className="field-hint" style={{ marginTop: 6 }}>
          Не закрывайте приложение до завершения.
        </p>
      </div>

      <ProgressBar stage={stage} percent={run.percent} failed={failed} />
      <StepList steps={run.steps} />

      {run.note && <Alert tone="info" title={run.note} />}

      {failed && (
        <Collapsible title="Диагностика">
          <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>
            {run.result?.diagnostics ?? 'Подробности появятся после завершения шага.'}
          </pre>
        </Collapsible>
      )}

      <div className="split-foot">
        <Button variant="secondary" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Прерывание может оставить сервер в промежуточном состоянии' : 'Отмена'}
        </Button>
      </div>
    </>
  );
}
