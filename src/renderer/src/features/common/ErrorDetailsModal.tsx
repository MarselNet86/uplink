import type { AppError } from '@shared/types';
import { Button } from '../../ui/Button';
import { CopyButton } from '../../ui/CopyButton';
import { Modal } from '../../ui/Modal';
import { ERROR_TEXT } from './errorText';
import { buildErrorReport } from './errorReport';

export interface ErrorDetailsModalProps {
  open: boolean;
  error: AppError | null;
  /** What the app was doing when this failed, e.g. "Проверка сервера". */
  context?: string;
  /** Overrides the generated report, for surfaces that failed more than once. */
  report?: string;
  onClose: () => void;
}

/**
 * The one place technical error detail is shown. Every failure in the app
 * pops this modal immediately - the code, the raw message from main and a
 * copy button, with no inline summary to click through first.
 */
export function ErrorDetailsModal({
  open,
  error,
  context,
  report: reportOverride,
  onClose,
}: ErrorDetailsModalProps) {
  if (!error) return null;
  const text = ERROR_TEXT[error.code];
  const report = reportOverride ?? buildErrorReport(error, context);

  return (
    <Modal
      open={open}
      title={text.title}
      onClose={onClose}
      footer={
        <>
          <CopyButton value={report} />
          <Button variant="primary" onClick={onClose}>
            Закрыть
          </Button>
        </>
      }
    >
      <span className="block">{text.hint}</span>
      <pre className="mono mt-4 max-h-64 overflow-auto text-xs" style={{ whiteSpace: 'pre-wrap' }}>
        {report}
      </pre>
    </Modal>
  );
}
