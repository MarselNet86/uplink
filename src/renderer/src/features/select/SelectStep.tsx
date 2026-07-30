import { useState } from 'react';
import type { CheckResult, ProtocolId } from '@shared/types';
import { PlanBuilder } from '@shared/planBuilder';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { cn } from '../../ui/lib/utils';
import { PROTOCOL_BADGE, PROTOCOL_PORT, PROTOCOL_TITLE, protocolMeta } from './protocolCopy';

export interface SelectStepProps {
  result: CheckResult;
  onBack: () => void;
  onManage: (protocol: ProtocolId) => void;
  onInstall: (protocols: ProtocolId[]) => void;
}

/**
 * Step 2 (tech.md section 4): a checkbox per protocol, disabled unless
 * `absent`; anything already found only offers "Управление" into the
 * conflict modal. Install stays inert until the pipeline lands in stage 5.
 */
export function SelectStep({ result, onBack, onManage, onInstall }: SelectStepProps) {
  const picks = PlanBuilder.derivePicks(result.protocols);
  const [selected, setSelected] = useState<Set<ProtocolId>>(
    () => new Set(picks.filter((p) => !p.disabled).map((p) => p.protocol)),
  );

  const toggle = (protocol: ProtocolId, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(protocol);
      else next.delete(protocol);
      return next;
    });
  };

  const plan = PlanBuilder.buildInstallPlan(Array.from(selected), result.protocols);
  const hasManageable = picks.some((p) => p.manageable);

  return (
    <>
      <div>
        <h3 className="split-h">Что поставить</h3>
        <p className="field-hint" style={{ marginTop: 6 }}>
          {result.distro.prettyName} · {result.distro.arch} · systemd{' '}
          {result.distro.hasSystemd ? 'есть' : 'нет'}
        </p>
      </div>

      <div className="picks">
        {picks.map((pick) => {
          const status = result.protocols.find((p) => p.protocol === pick.protocol);
          const badge = status ? PROTOCOL_BADGE[status.state] : undefined;
          return (
            <div key={pick.protocol} className={cn('pick', pick.disabled && 'pick--off')}>
              <span className="pick-mark">{pick.disabled ? '−' : '+'}</span>
              <div>
                <div className="pick-name">{PROTOCOL_TITLE[pick.protocol]}</div>
                <p className="pick-meta">{status && protocolMeta(pick.protocol, status.state)}</p>
              </div>
              {pick.manageable ? (
                <div className="comp-row">
                  {badge?.label && <Badge tone={badge.tone}>{badge.label}</Badge>}
                  <Button variant="ghost" onClick={() => onManage(pick.protocol)}>
                    Управление
                  </Button>
                </div>
              ) : (
                <Checkbox
                  checked={selected.has(pick.protocol)}
                  onCheckedChange={(checked) => toggle(pick.protocol, checked)}
                  label={`Установить · ${PROTOCOL_PORT[pick.protocol]}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {hasManageable && (
        <Alert tone="warn" title="Часть протоколов уже найдена на сервере">
          Переустановка или удаление выполняются через «Управление» - установка новых протоколов их
          не затрагивает.
        </Alert>
      )}

      <div className="split-foot">
        <Button variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <Button
          variant="primary"
          disabled={!plan.canInstall}
          onClick={() => onInstall(plan.installable)}
        >
          Установить
        </Button>
      </div>
    </>
  );
}
