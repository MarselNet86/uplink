import { TerminalCanvas } from './TerminalCanvas';

export interface TerminalAsideProps {
  /** Short uppercase readout of what the app is doing right now. */
  status: string;
}

/**
 * The left pane, shared by every screen: the ASCII canvas, the wordmark and
 * the status readout. It is the one element that never changes between
 * steps, so it has to be literally the same component everywhere - step 1
 * used to own it privately, which is exactly why steps 2-4 drifted into a
 * different look.
 */
export function TerminalAside({ status }: TerminalAsideProps) {
  return (
    <aside className="term-aside">
      <TerminalCanvas />
      <h1 className="term-wordmark">UPLINK</h1>
      <div className="term-tag term-tag--bottom">
        СТАТУС: <span className="term-tag-val">{status}</span>
      </div>
    </aside>
  );
}
