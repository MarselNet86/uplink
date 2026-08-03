import type { CheckResult, DeployParams } from '@shared/types';
import { WizardShell } from '../common/WizardShell';
import { ConnectForm } from './ConnectForm';

export interface ConnectScreenProps {
  onChecked: (result: CheckResult, params: DeployParams) => void;
}

/** Step 1 goes through the same shell as steps 2-4 - the terminal treatment belongs to the app, not to this screen. */
export function ConnectScreen({ onChecked }: ConnectScreenProps) {
  return (
    <WizardShell step={1}>
      <ConnectForm onChecked={onChecked} />
    </WizardShell>
  );
}
