import type { ProtocolId, ProtocolState, ProtocolStatus } from './types';

export interface ProtocolPick {
  protocol: ProtocolId;
  state: ProtocolState;
  /** Checkbox is only enabled when the protocol is not present at all. */
  disabled: boolean;
  /** "Управление" link/button is shown for anything already found. */
  manageable: boolean;
}

export interface InstallPlan {
  /** Selected protocols that are actually installable right now. */
  installable: ProtocolId[];
  canInstall: boolean;
}

/**
 * Select-step permission logic (tech.md 5.5): a protocol can only be
 * checked for install while `absent`. Reinstall/remove of an
 * already-found protocol goes through the conflict modal instead.
 * Pure and side-effect-free, so it is shared rather than main-only: the
 * renderer uses it to gate the step 2 UI, and install:start/protocols:remove
 * (stage 5+) use it again in main to build the actual request, which is the
 * authoritative enforcement point.
 */
export class PlanBuilder {
  static derivePicks(statuses: ProtocolStatus[]): ProtocolPick[] {
    return statuses.map((status) => ({
      protocol: status.protocol,
      state: status.state,
      disabled: status.state !== 'absent',
      manageable: status.state !== 'absent',
    }));
  }

  /**
   * Filters a checkbox selection down to protocols in `absent` state.
   * Covers tech.md 5.5's nine absent|installed|broken x2 combinations,
   * including the mixed case ("if VLESS is already up but Hysteria2 is
   * not, only Hysteria2 may be installed").
   */
  static buildInstallPlan(selected: ProtocolId[], statuses: ProtocolStatus[]): InstallPlan {
    const absentIds = new Set(
      statuses.filter((status) => status.state === 'absent').map((status) => status.protocol),
    );
    const installable = selected.filter((id) => absentIds.has(id));
    return { installable, canInstall: installable.length > 0 };
  }

  /** Filters a checkbox selection down to protocols that were actually found (removable/reinstallable). */
  static buildRemovePlan(selected: ProtocolId[], statuses: ProtocolStatus[]): ProtocolId[] {
    const foundIds = new Set(
      statuses.filter((status) => status.state !== 'absent').map((status) => status.protocol),
    );
    return selected.filter((id) => foundIds.has(id));
  }
}
