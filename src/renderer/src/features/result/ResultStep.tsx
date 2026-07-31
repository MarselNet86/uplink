import { useState } from 'react';
import type { RunResult } from '@shared/types';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { KeyCard } from '../../ui/KeyCard';
import { PROTOCOL_PORT, PROTOCOL_TITLE } from '../select/protocolCopy';
import { ERROR_TEXT } from '../common/errorText';

export interface ResultStepProps {
  result: RunResult;
  onDone: () => void;
}

/** Step 4 (tech.md section 4): one KeyCard per successful protocol, an alert per failed one. Links are shown once and never persisted by the app itself. */
export function ResultStep({ result, onDone }: ResultStepProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const succeeded = result.outcomes.filter((o) => o.ok && o.link);

  const allLinksText = succeeded.map((o) => o.link).join('\n');

  const copyAll = async () => {
    await navigator.clipboard.writeText(allLinksText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const saveToFile = async () => {
    await window.uplink.saveTextFile({ suggestedName: 'uplink-keys.txt', content: allLinksText });
  };

  return (
    <>
      <div>
        <h3 className="split-h">Готово</h3>
        <p className="field-hint" style={{ marginTop: 6 }}>
          Ссылки показываются один раз, приложение их не хранит.
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

      {result.outcomes
        .filter((o) => !o.ok)
        .map((outcome) => (
          <Alert
            key={outcome.protocol}
            tone="error"
            title={`${PROTOCOL_TITLE[outcome.protocol]}: ${outcome.error ? ERROR_TEXT[outcome.error.code].title : 'Ошибка'}`}
          >
            {outcome.error ? ERROR_TEXT[outcome.error.code].hint : undefined}
          </Alert>
        ))}

      {result.warnings.length > 0 && (
        <Alert tone="warn" title="Предупреждения">
          {result.warnings.join(' ')}
        </Alert>
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
    </>
  );
}
