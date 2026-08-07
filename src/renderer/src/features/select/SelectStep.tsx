import { useState } from 'react';
import type { CheckId, CheckResult, ProtocolId, ProtocolState } from '@shared/types';
import { PlanBuilder } from '@shared/planBuilder';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Collapsible } from '../../ui/Collapsible';
import { CopyButton } from '../../ui/CopyButton';
import { PROTOCOL_PORT, PROTOCOL_TITLE, protocolMeta } from './protocolCopy';

export interface SelectStepProps {
  result: CheckResult;
  onBack: () => void;
  onManage: (protocol: ProtocolId) => void;
  onInstall: (protocols: ProtocolId[]) => void;
  /** install:start is in flight - the step has not unmounted yet, so the button must not invite a second click. */
  starting?: boolean;
}

const PROTOCOL_INDEX: Record<ProtocolId, string> = {
  'vless-reality': '01',
  hysteria2: '02',
};

const PROTOCOL_DESC: Record<ProtocolId, string> = {
  'vless-reality': 'Disguised as a third party’s TLS. No domain needed.',
  hysteria2: 'Self-signed certificate. No domain needed.',
};

const STATE_GLYPH: Record<ProtocolState, string> = {
  installed: '[+]',
  broken: '[!]',
  absent: '[ ]',
  foreign: '[?]',
};

const STATE_LABEL: Record<ProtocolState, string> = {
  installed: 'INSTALLED · ACTIVE',
  broken: 'NOT RUNNING',
  absent: 'ABSENT',
  foreign: 'FOREIGN CONFIG',
};

const CHECK_LABEL: Record<CheckId, string> = {
  tcp: 'TCP',
  auth: 'AUTH',
  privileges: 'ROOT PRIVILEGES',
  distro: 'DISTRO',
  arch: 'ARCHITECTURE',
  systemd: 'SYSTEMD',
  outbound: 'OUTBOUND ACCESS',
  ports: 'PORTS',
  dns: 'DNS',
  'apt-lock': 'APT LOCK',
};

const CHECK_GLYPH = { ok: '[+]', warn: '[~]', fail: '[!]' } as const;

export function SelectStep({ result, onBack, onManage, onInstall, starting }: SelectStepProps) {
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
      <h3 className="split-h">Protocols</h3>

      {/* Same shape as the fields on step 1: label left, value right, one
          hairline per row - the server readout is data, not prose. */}
      <dl className="readout">
        <div className="readout-row">
          <dt>SYSTEM</dt>
          <dd>{result.distro.prettyName}</dd>
        </div>
        <div className="readout-row">
          <dt>ARCHITECTURE</dt>
          <dd>{result.distro.arch}</dd>
        </div>
        <div className="readout-row">
          <dt>SYSTEMD</dt>
          <dd>{result.distro.hasSystemd ? 'YES' : 'NO'}</dd>
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
                  <p className="node-label">ACCESS KEY FROM SERVER</p>
                  <p className="node-link">{link}</p>
                </>
              )}

              {pick.manageable ? (
                <>
                  {/* Why installing is blocked and only Manage is offered
                      (BUG-13) - without this a foreign/broken protocol gave
                      no explanation beyond the state badge above. */}
                  <p className="node-meta">{protocolMeta(pick.protocol, state)}</p>
                  <div className="node-foot">
                    {link ? <CopyButton value={link} /> : <span />}
                    <Button variant="secondary" onClick={() => onManage(pick.protocol)}>
                      Manage
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="node-meta">{PROTOCOL_DESC[pick.protocol]}</p>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => toggle(pick.protocol, next)}
                    label={`Install · ${PROTOCOL_PORT[pick.protocol]}`}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <Collapsible title={`Server checks · ${okCount}/${result.preflight.items.length}`}>
        <dl className="readout">
          {result.preflight.items.map((item) => (
            <div key={item.id} className="readout-row" data-status={item.status}>
              <dt>
                <span className="readout-glyph">{CHECK_GLYPH[item.status]}</span>{' '}
                {CHECK_LABEL[item.id]}
              </dt>
              <dd>{item.detail ?? (item.status === 'ok' ? 'OK' : '—')}</dd>
            </div>
          ))}
        </dl>
      </Collapsible>

      {/* BUG-02: a failed check (e.g. a busy port) never actually blocked
          installation - the button stayed enabled and the run failed much
          later, deep into the pipeline, without pointing back at the check
          that already knew. main now refuses the same way server-side
          (installStart.ts's preflight step); this is just the immediate,
          same-screen feedback. */}
      {!result.preflight.passed && (
        <Alert tone="error" title="Server checks failed">
          Fix the failed check above before installing.
        </Alert>
      )}

      <div className="split-foot">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          disabled={!plan.canInstall || !result.preflight.passed || starting}
          onClick={() => onInstall(plan.installable)}
        >
          {starting ? 'Starting...' : 'Install'}
        </Button>
      </div>
    </>
  );
}
