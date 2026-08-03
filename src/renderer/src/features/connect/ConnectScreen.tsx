import { useState } from 'react';
import type { CheckResult, DeployParams } from '@shared/types';
import { WizardShell } from '../common/WizardShell';
import { ConnectForm } from './ConnectForm';

export interface ConnectScreenProps {
  onChecked: (result: CheckResult, params: DeployParams) => void;
}

/**
 * Step 1 goes through the same shell as steps 2-4 - the terminal treatment
 * belongs to the app, not to this screen. The only thing it owns is the
 * probe flag, which it feeds back into the shared status readout so the
 * left pane stays honest instead of being decoration.
 */
export function ConnectScreen({ onChecked }: ConnectScreenProps) {
  const [probing, setProbing] = useState(false);

  return (
    <WizardShell step={1} status={probing ? 'ОПРОС СЕРВЕРА…' : 'ЖДУ ВВОДА'}>
      <ConnectForm onChecked={onChecked} onProbingChange={setProbing} />
    </WizardShell>
  );
}
