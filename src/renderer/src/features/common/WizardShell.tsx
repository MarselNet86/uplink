import type { ReactNode } from 'react';
import { Stepper } from '../../ui/Stepper';

export interface WizardShellProps {
  step: 1 | 2 | 3 | 4;
  caption: string;
  children: ReactNode;
}

/**
 * Split composition from the design code (docs/design-reference.html §06):
 * a static image/caption pane on the left holds the frame across all four
 * wizard steps while the right pane's content is swapped.
 */
export function WizardShell({ step, caption, children }: WizardShellProps) {
  return (
    <div className="split">
      <div className="split-aside">
        <p className="split-caption">{caption}</p>
      </div>
      <div className="split-main">
        <div className="split-brand">Uplink.</div>
        <Stepper current={step} />
        {children}
      </div>
    </div>
  );
}
