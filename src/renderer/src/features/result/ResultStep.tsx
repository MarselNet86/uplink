import { useState } from 'react';
import type { ProtocolId, RunResult } from '@shared/types';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
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

/** Removes `&pinSHA256=...` for the "link without pin" fallback (tech.md 5.9) - clients on some builds fail to parse a hy2 link that includes the pin. */
function stripPinSha256(link: string): string {
  return link.replace(/[?&]pinSHA256=[^&#]*/, '');
}

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
    lines.push('', 'Предупреждения:', ...result.warnings.map((w) => `- ${w}`));
  }
  if (result.diagnostics) {
    lines.push('', 'Диагностика:', result.diagnostics);
  }
  return lines.join('\n');
}

/** Step 4 (tech.md section 4): one KeyCard per successful protocol, an alert per failed one. Links are shown once and never persisted by the app itself. */
export function ResultStep({ result, onDone }: ResultStepProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [noPin, setNoPin] = useState<Set<ProtocolId>>(new Set());
  const succeeded = result.outcomes.filter((o) => o.ok && o.link);
  // Removal/reinstall-without-a-fresh-link outcomes: ok, but nothing to show a KeyCard for.
  const succeededWithoutLink = result.outcomes.filter((o) => o.ok && !o.link);
  const failed = result.outcomes.filter((o) => !o.ok);
  const diagnosticsReport = buildDiagnosticsReport(result);
  // Pops on arrival at this step whenever anything failed, then stays closed
  // once dismissed - the report is still reachable under "Диагностика".
  const [errorDismissed, setErrorDismissed] = useState(false);
  const firstError = failed.find((o) => o.error)?.error ?? null;

  const allLinksText = succeeded.map((o) => o.link).join('\n');

  const copyAll = async () => {
    await navigator.clipboard.writeText(allLinksText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const saveToFile = async () => {
    await window.uplink.saveTextFile({ suggestedName: 'uplink-keys.txt', content: allLinksText });
  };

  const togglePin = (protocol: ProtocolId, withoutPin: boolean) => {
    setNoPin((prev) => {
      const next = new Set(prev);
      if (withoutPin) next.add(protocol);
      else next.delete(protocol);
      return next;
    });
  };

  return (
    <>
      <div>
        <h3 className="split-h">Готово</h3>
        <p className="field-hint" style={{ marginTop: 6 }}>
          {succeeded.length > 0
            ? 'Ссылки показываются один раз, приложение их не хранит.'
            : 'Результат операции ниже.'}
        </p>
      </div>

      {succeeded.map((outcome) => {
        if (!outcome.link) return null;
        const hasPin = outcome.link.includes('pinSHA256=');
        const link =
          hasPin && noPin.has(outcome.protocol) ? stripPinSha256(outcome.link) : outcome.link;
        return (
          <KeyCard
            key={outcome.protocol}
            protocol={outcome.protocol}
            port={PROTOCOL_PORT[outcome.protocol]}
            link={link}
            footerExtra={
              hasPin ? (
                <Checkbox
                  checked={noPin.has(outcome.protocol)}
                  onCheckedChange={(checked) => togglePin(outcome.protocol, checked)}
                  label="Ссылка без пина"
                  description="Для клиентов, у которых ломается pinSHA256"
                />
              ) : undefined
            }
          />
        );
      })}

      {succeededWithoutLink.length > 0 && (
        <Alert tone="info" title="Удалено">
          {succeededWithoutLink.map((o) => PROTOCOL_TITLE[o.protocol]).join(', ')}
        </Alert>
      )}

      {/* Which protocol failed - the reason itself lives in the modal. */}
      {failed.map((outcome) => (
        <Alert
          key={outcome.protocol}
          tone="error"
          title={`${PROTOCOL_TITLE[outcome.protocol]}: ${outcome.error ? ERROR_TEXT[outcome.error.code].title : 'Ошибка'}`}
        />
      ))}

      {result.warnings.length > 0 && (
        <Alert tone="warn" title="Предупреждения">
          {result.warnings.join(' ')}
        </Alert>
      )}

      {(failed.length > 0 || result.diagnostics) && (
        <Collapsible title="Диагностика">
          <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
            Скопируйте и пришлите этот текст, если нужна помощь с ошибкой.
          </p>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>
            {diagnosticsReport}
          </pre>
          <CopyButton value={diagnosticsReport} className="mt-2" />
        </Collapsible>
      )}

      {succeeded.length > 0 && (
        <div className="split-foot">
          <Button variant="secondary" onClick={() => void saveToFile()}>
            Сохранить в файл
          </Button>
          <Button variant="primary" onClick={() => void copyAll()}>
            {copiedAll ? 'Скопировано' : 'Копировать всё'}
          </Button>
        </div>
      )}

      <div className="split-foot">
        <Button variant="ghost" onClick={onDone}>
          Готово
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
