import { useState } from 'react';
import type { RunResult } from '@shared/types';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Collapsible } from '../../ui/Collapsible';
import { CopyButton } from '../../ui/CopyButton';
import { KeyCard } from '../../ui/KeyCard';
import { PROTOCOL_PORT, PROTOCOL_TITLE } from '../select/protocolCopy';
import { ERROR_TEXT } from '../common/errorText';
import { ErrorDetailsModal } from '../common/ErrorDetailsModal';

export interface ResultStepProps {
  result: RunResult;
  onDone: () => void;
}

const INCY_DOWNLOAD_URL = 'https://github.com/INCY-DEV/incy-platforms';

/**
 * Plain-text dump of everything useful for debugging: per-protocol error
 * code/message and the redacted diagnostics string from main. Meant to be
 * copied out of the app and pasted somewhere else - never contains the SSH
 * password or private keys (redact() already ran on `diagnostics` in main).
 */
function buildDiagnosticsReport(result: RunResult): string {
  const lines: string[] = [];
  for (const outcome of result.outcomes) {
    if (outcome.ok || !outcome.error) continue;
    lines.push(
      `${PROTOCOL_TITLE[outcome.protocol]}: [${outcome.error.code}] ${outcome.error.message}`,
    );
  }
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:', ...result.warnings.map((w) => `- ${w}`));
  }
  if (result.diagnostics) {
    lines.push('', 'Diagnostics:', result.diagnostics);
  }
  return lines.join('\n');
}

/** Step 4 (tech.md section 4): one KeyCard per successful protocol, an alert per failed one. Links are shown once and never persisted by the app itself. */
export function ResultStep({ result, onDone }: ResultStepProps) {
  const succeeded = result.outcomes.filter((o) => o.ok && o.link);
  // Removal/reinstall-without-a-fresh-link outcomes: ok, but nothing to show a KeyCard for.
  const succeededWithoutLink = result.outcomes.filter((o) => o.ok && !o.link);
  const failed = result.outcomes.filter((o) => !o.ok);
  const diagnosticsReport = buildDiagnosticsReport(result);
  // Pops on arrival at this step whenever anything failed, then stays closed
  // once dismissed - the report is still reachable under "Diagnostics".
  const [errorDismissed, setErrorDismissed] = useState(false);
  const firstError = failed.find((o) => o.error)?.error ?? null;

  return (
    <>
      <div>
        <h3 className="split-h">Done</h3>
        <p className="field-hint" style={{ marginTop: 6 }}>
          {succeeded.length > 0
            ? 'Links are shown once, the app does not store them.'
            : 'The result of the operation is below.'}
        </p>
      </div>

      {succeeded.map((outcome) =>
        outcome.link ? (
          <KeyCard
            key={outcome.protocol}
            protocol={outcome.protocol}
            port={PROTOCOL_PORT[outcome.protocol]}
            link={outcome.link}
          />
        ) : null,
      )}

      {succeededWithoutLink.length > 0 && (
        <Alert tone="info" title="Removed">
          {succeededWithoutLink.map((o) => PROTOCOL_TITLE[o.protocol]).join(', ')}
        </Alert>
      )}

      {/* Which protocol failed - the reason itself lives in the modal. */}
      {failed.map((outcome) => (
        <Alert
          key={outcome.protocol}
          tone="error"
          title={`${PROTOCOL_TITLE[outcome.protocol]}: ${outcome.error ? ERROR_TEXT[outcome.error.code].title : 'Error'}`}
        />
      ))}

      {succeeded.length > 0 && (
        <Alert tone="info" title="Final step">
          Add the links above as a subscription in the INCY proxy client. Download the client for
          all platforms:{' '}
          <a href={INCY_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            {INCY_DOWNLOAD_URL}
          </a>
        </Alert>
      )}

      {(failed.length > 0 || result.diagnostics) && (
        <Collapsible title="Diagnostics">
          <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
            Copy and send this text if you need help with the error.
          </p>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>
            {diagnosticsReport}
          </pre>
          <CopyButton value={diagnosticsReport} className="mt-2" />
        </Collapsible>
      )}

      <div className="split-foot">
        <span />
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>

      <ErrorDetailsModal
        open={firstError !== null && !errorDismissed}
        error={firstError}
        report={diagnosticsReport}
        onClose={() => setErrorDismissed(true)}
      />
    </>
  );
}
