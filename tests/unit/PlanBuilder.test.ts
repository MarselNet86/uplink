import { describe, expect, it } from 'vitest';
import type { ProtocolId, ProtocolState, ProtocolStatus } from '@shared/types';
import { PlanBuilder } from '@shared/planBuilder';

const STATES: ProtocolState[] = ['absent', 'installed', 'broken'];

function statusesFor(xrayState: ProtocolState, hy2State: ProtocolState): ProtocolStatus[] {
  return [
    { protocol: 'vless-reality', state: xrayState, serviceActive: xrayState === 'installed' },
    { protocol: 'hysteria2', state: hy2State, serviceActive: hy2State === 'installed' },
  ];
}

const ALL_PROTOCOLS: ProtocolId[] = ['vless-reality', 'hysteria2'];

describe('PlanBuilder.buildInstallPlan - all nine absent|installed|broken combinations', () => {
  for (const xrayState of STATES) {
    for (const hy2State of STATES) {
      it(`xray=${xrayState}, hy2=${hy2State}`, () => {
        const statuses = statusesFor(xrayState, hy2State);
        const plan = PlanBuilder.buildInstallPlan(ALL_PROTOCOLS, statuses);

        const expectedInstallable = ALL_PROTOCOLS.filter(
          (id) => statuses.find((s) => s.protocol === id)?.state === 'absent',
        );

        expect(plan.installable.sort()).toEqual(expectedInstallable.sort());
        expect(plan.canInstall).toBe(expectedInstallable.length > 0);
      });
    }
  }
});

describe('PlanBuilder.buildInstallPlan - mixed state rule', () => {
  it('permits only the absent protocol when the other is already installed', () => {
    const statuses = statusesFor('installed', 'absent');
    const plan = PlanBuilder.buildInstallPlan(ALL_PROTOCOLS, statuses);
    expect(plan.installable).toEqual(['hysteria2']);
    expect(plan.canInstall).toBe(true);
  });

  it('never installs a protocol the user did not select, even if absent', () => {
    const statuses = statusesFor('absent', 'absent');
    const plan = PlanBuilder.buildInstallPlan(['hysteria2'], statuses);
    expect(plan.installable).toEqual(['hysteria2']);
  });

  it('canInstall is false when nothing absent is selected', () => {
    const statuses = statusesFor('installed', 'broken');
    const plan = PlanBuilder.buildInstallPlan(ALL_PROTOCOLS, statuses);
    expect(plan.installable).toEqual([]);
    expect(plan.canInstall).toBe(false);
  });
});

describe('PlanBuilder.derivePicks', () => {
  it('enables the checkbox only for absent protocols', () => {
    const picks = PlanBuilder.derivePicks(statusesFor('absent', 'installed'));
    expect(picks).toEqual([
      { protocol: 'vless-reality', state: 'absent', disabled: false, manageable: false },
      { protocol: 'hysteria2', state: 'installed', disabled: true, manageable: true },
    ]);
  });

  it('treats foreign as disabled and manageable', () => {
    const picks = PlanBuilder.derivePicks([
      { protocol: 'vless-reality', state: 'foreign', serviceActive: true },
    ]);
    expect(picks[0]).toMatchObject({ disabled: true, manageable: true });
  });
});

describe('PlanBuilder.buildRemovePlan', () => {
  it('keeps only protocols that were actually found', () => {
    const statuses = statusesFor('installed', 'absent');
    const removed = PlanBuilder.buildRemovePlan(ALL_PROTOCOLS, statuses);
    expect(removed).toEqual(['vless-reality']);
  });

  it('returns an empty plan when both protocols are absent', () => {
    const statuses = statusesFor('absent', 'absent');
    expect(PlanBuilder.buildRemovePlan(ALL_PROTOCOLS, statuses)).toEqual([]);
  });
});
