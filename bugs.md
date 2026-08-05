# Bug fixes

Log of fixes applied for the defects catalogued in `spec.md` section 11
(BUG-01…BUG-23). One entry per bug: what was wrong, why, and the fix. Kept
short and factual; see `spec.md` for the original live/reasoned findings and
`tech.md` for the contract these fixes have to stay inside.

## BUG-01 - idle timeout fires mid-install (blocker)

**Cause:** `SshSession`'s 5-minute idle timer was armed once, at
`getCommandRunner()`/`getFileTransfer()` acquisition time, not on actual use.
An installer gets the runner exactly once and holds onto it for the whole
run, so any run - or single slow command - taking longer than 5 minutes was
disconnected out from under itself regardless of whether the connection was
genuinely idle. A secondary bug in the same area (E-06): the idle timer
called `session.dispose()` directly instead of going through
`sessionRegistry.disposeSession()`, so the registry kept a dead session
reachable by `getSession()` after the timeout fired.

**Fix:** `CommandRunner` and `FileTransfer` now take an `onActivity`
callback, invoked at the start of every `exec()`/`writeFile()`, which rearms
the session's idle timer. The timer now measures actual silence between
commands, not wall-clock time since session creation. Added
`SshSession.onIdleTimeout()` so `sessionRegistry.registerSession()` can drop
its Map entry when the timer fires, closing the zombie-entry gap.

Files: `src/main/ssh/SshSession.ts`, `src/main/ssh/sessionRegistry.ts`,
`src/main/ssh/CommandRunner.ts`, `src/main/ssh/FileTransfer.ts`.

## BUG-18 - timed-out command keeps running on the server

**Cause:** `CommandRunner`'s per-command timeout called `stream.close()`,
which only tears down the client's view of the SSH channel. The remote
process (e.g. `apt-get update`, a `curl` download) was never signalled and
kept running to completion on the server, orphaned and unseen by the app -
confirmed live three times, including a fully-downloaded but never-installed
Xray archive left behind in `/tmp`.

**Fix:** every command now runs wrapped in the remote `timeout -k 10 <n>s`,
so the server itself kills the process tree (SIGTERM, then SIGKILL after a
10s grace) when the budget elapses, independent of the SSH channel's state.
The client-side timer stays as a backstop (now armed for `timeoutMs +
15_000`) for the case where the channel itself never reports back at all.
`timeout`'s exit code 124 is mapped to the same `CommandRunnerError`
(`E_TIMEOUT`) callers already expected, so no caller-visible contract change.

Files: `src/main/ssh/CommandRunner.ts`.

## BUG-19 - Hysteria2 can report success on a service that already crashed (blocker)

**Cause:** `waitForService()` returned `true` on the first poll where
`systemctl is-active` said `active` and the port was bound. For a
`Type=simple` unit, `is-active` flips to `active` the instant the process
forks - before it has had any chance to fail. Live: a Hysteria2 instance
whose ACME http-01 challenge failed (port 80 taken by something else)
crashed 2.479s after start; the single check landed inside that window and
the app showed `Done` with a link to a service that was already dead.

**Fix:** `waitForService()` now re-checks (`is-active` + bound port) again
after a short delay before trusting the first positive reading, and only
returns success if both checks agree. Factored the check itself into
`isActiveAndBound()` so the retry doesn't duplicate the polling logic.

Files: `src/main/domain/installers/BaseInstaller.ts`.
