import type { ReactNode } from 'react';
import { Stepper } from '../../ui/Stepper';
import { TerminalAside } from './TerminalAside';

export interface WizardShellProps {
  step: 1 | 2 | 3 | 4;
  children: ReactNode;
}

/**
 * Split composition (docs/design-reference.html §06): the terminal pane on
 * the left holds the frame across all four wizard steps while the right
 * pane's content is swapped. Both panes are on the terminal treatment - the
 * app has a single visual style, not one per step.
 */
export function WizardShell({ step, children }: WizardShellProps) {
  return (
    <div className="split term">
      <TerminalAside />
      <div className="split-main">
        <Stepper current={step} />
        {children}
      </div>
    </div>
  );
}
