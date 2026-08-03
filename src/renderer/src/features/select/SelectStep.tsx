import { useState } from 'react';
import type { CheckId, CheckResult, ProtocolId, ProtocolState } from '@shared/types';
import { PlanBuilder } from '@shared/planBuilder';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Collapsible } from '../../ui/Collapsible';
import { CopyButton } from '../../ui/CopyButton';
import { PROTOCOL_PORT, PROTOCOL_TITLE } from './protocolCopy';

export interface SelectStepProps {
  result: CheckResult;
  onBack: () => void;
  onManage: (protocol: ProtocolId) => void;
  onInstall: (protocols: ProtocolId[]) => void;
}

const PROTOCOL_INDEX: Record<ProtocolId, string> = {
  'vless-reality': '01',
  hysteria2: '02',
};

const PROTOCOL_DESC: Record<ProtocolId, string> = {
  'vless-reality': 'Маскировка под чужой TLS. Домен не нужен.',
  hysteria2: 'Самоподписанный сертификат. Домен не нужен.',
};

const STATE_GLYPH: Record<ProtocolState, string> = {
  installed: '[+]',
  broken: '[!]',
  absent: '[ ]',
  foreign: '[?]',
};

const STATE_LABEL: Record<ProtocolState, string> = {
  installed: 'УСТАНОВЛЕН · АКТИВЕН',
  broken: 'НЕ ЗАПУЩЕН',
  absent: 'ОТСУТСТВУЕТ',
  foreign: 'ЧУЖОЙ КОНФИГ',
};

const CHECK_LABEL: Record<CheckId, string> = {
  tcp: 'TCP',
  auth: 'АВТОРИЗАЦИЯ',
  privileges: 'ПРАВА ROOT',
  distro: 'ДИСТРИБУТИВ',
  arch: 'АРХИТЕКТУРА',
  systemd: 'SYSTEMD',
  outbound: 'ИСХОДЯЩИЙ ДОСТУП',
  ports: 'ПОРТЫ',
  dns: 'DNS',
  'apt-lock': 'БЛОКИРОВКА APT',
};

const CHECK_GLYPH = { ok: '[+]', warn: '[~]', fail: '[!]' } as const;

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
  const okCount = result.preflight.items.filter((item) => item.status === 'ok').length;

  return (
    <>
      <h3 className="split-h">Протоколы</h3>

      {/* Same shape as the fields on step 1: label left, value right, one
          hairline per row - the server readout is data, not prose. */}
      <dl className="readout">
        <div className="readout-row">
          <dt>СИСТЕМА</dt>
          <dd>{result.distro.prettyName}</dd>
        </div>
        <div className="readout-row">
          <dt>АРХИТЕКТУРА</dt>
          <dd>{result.distro.arch}</dd>
        </div>
        <div className="readout-row">
          <dt>SYSTEMD</dt>
          <dd>{result.distro.hasSystemd ? 'ЕСТЬ' : 'НЕТ'}</dd>
        </div>
      </dl>

      <div className="node-list">
        {picks.map((pick) => {
          const status = result.protocols.find((p) => p.protocol === pick.protocol);
          const state = status?.state ?? 'absent';
          const link = status?.link;
          const isOn = state === 'installed';
          const isWarn = state === 'broken' || state === 'foreign';
          const checked = selected.has(pick.protocol);

          return (
            <div
              key={pick.protocol}
              className="node"
              data-active={!pick.manageable && checked ? 'true' : undefined}
            >
              <div className="node-head">
                <div className="node-title">
                  <span className="node-id">{`NODE_${PROTOCOL_INDEX[pick.protocol]} // `}</span>
                  {PROTOCOL_TITLE[pick.protocol]}
                </div>
                <span className="node-port">{PROTOCOL_PORT[pick.protocol]}</span>
              </div>

              <div className="node-status">
                <span
                  className={
                    isOn
                      ? 'node-glyph node-glyph--on'
                      : isWarn
                        ? 'node-glyph node-glyph--warn'
                        : 'node-glyph node-glyph--off'
                  }
                >
                  {STATE_GLYPH[state]}
                </span>
                <span className="node-status-label">{STATE_LABEL[state]}</span>
              </div>

              {link && (
                <>
                  <p className="node-label">КЛЮЧ ДОСТУПА С СЕРВЕРА</p>
                  <p className="node-link">{link}</p>
                </>
              )}

              {pick.manageable ? (
                <div className="node-foot">
                  {link ? <CopyButton value={link} /> : <span />}
                  <Button variant="secondary" onClick={() => onManage(pick.protocol)}>
                    Управление
                  </Button>
                </div>
              ) : (
                <>
                  <p className="node-meta">{PROTOCOL_DESC[pick.protocol]}</p>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => toggle(pick.protocol, next)}
                    label={`Установить · ${PROTOCOL_PORT[pick.protocol]}`}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <Collapsible title={`Проверки сервера · ${okCount}/${result.preflight.items.length}`}>
        <dl className="readout">
          {result.preflight.items.map((item) => (
            <div key={item.id} className="readout-row" data-status={item.status}>
              <dt>
                <span className="readout-glyph">{CHECK_GLYPH[item.status]}</span>{' '}
                {CHECK_LABEL[item.id]}
              </dt>
              <dd>{item.detail ?? (item.status === 'ok' ? 'ОК' : '—')}</dd>
            </div>
          ))}
        </dl>
      </Collapsible>

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
