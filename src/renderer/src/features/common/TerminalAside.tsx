import { TerminalCanvas } from './TerminalCanvas';

const TELEGRAM_URL = 'https://t.me/DaimonGRP';

/**
 * The left pane, shared by every screen: the ASCII canvas, the wordmark and
 * a link to the project channel. It is the one element that never changes
 * between steps, so it has to be literally the same component everywhere -
 * step 1 used to own it privately, which is exactly why steps 2-4 drifted
 * into a different look.
 */
export function TerminalAside() {
  return (
    <aside className="term-aside">
      <TerminalCanvas />
      <h1 className="term-wordmark">UPLINK</h1>
      <div className="term-tag term-tag--bottom">
        tg:{' '}
        <a className="term-tag-val" href={TELEGRAM_URL} target="_blank" rel="noreferrer">
          {TELEGRAM_URL}
        </a>
      </div>
    </aside>
  );
}
