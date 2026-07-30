import type { CheckResult } from '@shared/types';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';

export interface CheckResultPreviewProps {
  result: CheckResult;
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  ok: '—',
  warn: 'внимание',
  fail: 'провал',
};

const PROTOCOL_TITLE: Record<string, string> = {
  'vless-reality': 'VLESS + Reality',
  hysteria2: 'Hysteria2',
};

/**
 * Raw ssh:check result, shown as-is until stage 3 builds the real step 2
 * (protocol picks + PlanBuilder). Proves the round trip end to end.
 */
export function CheckResultPreview({ result, onBack }: CheckResultPreviewProps) {
  return (
    <>
      <h3 className="split-h">{result.distro.prettyName}</h3>
      <p className="field-hint">
        {result.distro.arch} · systemd {result.distro.hasSystemd ? 'есть' : 'нет'} · проверка{' '}
        {result.preflight.passed ? 'пройдена' : 'провалена'}
      </p>

      <ul className="steps">
        {result.preflight.items.map((item) => (
          <li
            key={item.id}
            className="step"
            data-state={
              item.status === 'ok' ? 'done' : item.status === 'warn' ? 'running' : 'failed'
            }
          >
            <span className="step-glyph">
              {item.status === 'ok' ? '−' : item.status === 'warn' ? '·' : '×'}
            </span>
            <span>
              {item.id}
              {item.detail ? ` · ${item.detail}` : ''}
            </span>
            <span className="step-tick">{STATUS_LABEL[item.status]}</span>
          </li>
        ))}
      </ul>

      <div className="comp-row" style={{ gap: 'var(--s3)' }}>
        {result.protocols.map((p) => (
          <Badge
            key={p.protocol}
            tone={
              p.state === 'installed' ? 'success' : p.state === 'foreign' ? 'danger' : 'default'
            }
          >
            {PROTOCOL_TITLE[p.protocol]} · {p.state}
          </Badge>
        ))}
      </div>

      <div className="split-foot">
        <Button variant="secondary" onClick={onBack}>
          Назад
        </Button>
      </div>
    </>
  );
}
