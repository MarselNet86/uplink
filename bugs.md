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

## BUG-04 - apt-get timeout too short for its own budget

**Cause:** `apt-get update`/`install` ran with `CommandRunner`'s 60s default
timeout, while the core-download step right after it gets 600s. Live: a
budget VPS with several apt mirrors configured took 3-4 minutes for
`apt-get update` alone with no throttling involved - the 60s budget failed
this step long before there was anything actually wrong.

**Fix:** `installAptPackages()` now passes an explicit 300s timeout for both
commands.

Files: `src/main/domain/installers/BaseInstaller.ts`.

## BUG-05 - a bad Reality donor leaves an installed-but-unconfigured Xray core behind

**Cause:** Donor selection (X4) runs in `generateSecrets()`, after
`installCore()`, because the check itself shells out to `xray tls ping` -
it needs the binary to exist. A failing donor check therefore always left
Xray installed on the server with no config and no running service.

**Fix:** Reordering the check itself isn't possible without replacing `xray
tls ping` with a hand-rolled TLS probe (out of scope, and a contract change
per tech.md 5.6 X4). Instead, `generateSecrets()` now catches a donor-check
failure and removes the just-installed, still-unconfigured core
(`systemctl disable --now xray`, delete the binary and `/usr/local/etc/xray`)
before re-throwing the original error - best-effort, and never masks the
real `E_NO_REALITY_DONOR`.

Files: `src/main/domain/installers/XrayRealityInstaller.ts`.

## BUG-14 - 15s service-verify wait too short

**Cause:** Both `XrayRealityInstaller` and `Hysteria2Installer`'s
self-signed branch gave `waitForService()` only 15s to see the unit become
active and bound. On a loaded or slow server the daemon can take longer
than that to bind its socket, which would fail a perfectly good install
with `E_SERVICE_FAILED`.

**Fix:** Raised `SERVICE_START_MAX_WAIT_MS` to 30s in both installers.

Files: `src/main/domain/installers/XrayRealityInstaller.ts`,
`src/main/domain/installers/Hysteria2Installer.ts`.

## BUG-15 (and BUG-06) - SSH-level failures collapse into E_UNKNOWN

**Cause:** Every ssh2-level failure without an exact `err.level`/`err.code`
match fell through to `E_UNKNOWN`/"Unknown error" - confirmed live four
separate ways: a slow trust-dialog decision ("Timed out while waiting for
handshake"), a silently unreachable host (same message), a plain wrong port
("Connection lost before handshake"), and a transient channel failure
("Channel open failure: open failed"). The same gap applies to a connection
dropped mid-install after the session was already established (BUG-06,
blocked from live confirmation by the tester's VPN, but the same missing
classification either way): `BaseInstaller`/`BaseRemover.toAppError()` had
no fallback beyond `instanceof InstallerError`/`CommandRunnerError`.

**Fix:** New `classifySshError()` (`src/main/ssh/classifySshError.ts`)
matches the exact wording confirmed live - timeout-shaped messages become
`E_TIMEOUT`, connection-drop-shaped messages become `E_NET_UNREACHABLE` -
and falls back to `E_UNKNOWN` only when nothing matches, never inventing a
code it isn't reasonably sure of. Wired into `mapConnectError()` (connect
time), `BaseInstaller`/`BaseRemover.toAppError()` (mid-run), and
`sshCheck.ts`'s preflight catch block, so the same class of raw ssh2 error
gets the same treatment everywhere it can surface. Also added the
`client-timeout` level explicitly to `mapConnectError()`.

Files: `src/main/ssh/classifySshError.ts` (new), `src/main/ssh/SshSession.ts`,
`src/main/domain/installers/BaseInstaller.ts`,
`src/main/domain/removers/BaseRemover.ts`, `src/main/ipc/handlers/sshCheck.ts`.

## BUG-20 - declining to trust a new server looks like a real mismatch

**Cause:** `resolveHostKeyDecision()` returned a plain boolean, `false` for
both "this is a brand-new server and the user declined to trust it" and
"the stored fingerprint no longer matches" (an actual, dangerous mismatch).
`mapConnectError()` only saw that boolean, so declining a first-time
connection showed the exact same "fingerprint has changed / possible
MITM/OS reinstall" alarm as a genuine hijack - confirmed live.

**Fix:** `resolveHostKeyDecision()` now returns a three-way
`'accepted' | 'declined-new' | 'mismatch'` instead of a boolean.
`mapConnectError()` maps `'mismatch'` to the existing
`E_SSH_HOSTKEY_MISMATCH` alarm, unchanged, and `'declined-new'` to
`E_CANCELLED` ("Server fingerprint was not trusted") - an existing contract
code that already fits the "user chose not to proceed" case exactly, no
contract change needed.

Files: `src/main/ssh/SshSession.ts`.

## BUG-07 (and BUG-08) - self-signed is unreachable from the UI

**Cause:** `tech.md` section 4 specifies self-signed as the actual default:
Hysteria2 should only switch to `acme-domain` when the user explicitly
checks "use my own domain". `ConnectForm.submit()` instead always computed
`domain` from `deriveAutoDomain(values.host)` regardless of the checkbox,
which returns a non-empty `<ip>.sslip.io` for every IPv4 host - so
`acme-domain` (and the sslip.io/Let's Encrypt dependency, and its weekly
issuance limit) was selected for essentially every real install, and the
checkbox's own unchecked state was silently ignored. This is also BUG-08's
root cause (the same forced ACME path burns the rate limit on ordinary use).

**Fix:** `domain`/`acmeEmail` are now only ever taken from the form's own
fields, and only when `domainOverride` is true - matching tech.md's
described behavior exactly. Rewrote the collapsible's copy to describe the
real default (self-signed, no domain) instead of a domain that was said to
be used automatically. Removed the now-unused sslip.io auto-fill path from
the component; `deriveAutoDomain`/`deriveAutoAcmeEmail` stay in
`formValidation.ts` as tested pure functions, just no longer invoked from
the form.

Files: `src/renderer/src/features/connect/ConnectForm.tsx`.

## BUG-09 - DNS check compares a hostname against itself

**Cause:** `checkDns()` resolved the domain via `getent hosts` and compared
the result to `connectedHost` directly - correct when the user connects by
IP, but when they connect by hostname (e.g. a sslip.io name) the check
compared that hostname string to itself and always failed, even when the
domain's A record was genuinely correct. Live: `31.207.77.243.sslip.io's A
record does not point to 31.207.77.243.sslip.io`.

**Fix:** `connectedHost` is now resolved the same way the domain is
(`getent hosts`) whenever it isn't already an IP (`node:net`'s `isIP()`),
so the comparison is always IP-to-IP. Added a regression test for the
hostname-connected case.

Files: `src/main/domain/Preflight.ts`, `tests/unit/Preflight.test.ts`.

## BUG-10 - cancelling mid-reinstall gives no warning that the old install is gone

**Cause:** A reinstall's remover step runs before its installer steps
(tech.md 5.10). Cancelling once the remover had already finished but before
the new install completed showed the exact same "Cancelled / Operation
cancelled by user" text as cancelling before anything happened at all -
live: a fully-removed protocol and a genuine no-op looked identical to the
user.

**Fix:** `buildRunResult()`'s cancelled branch now checks whether the unit
was already in-flight (its own start step reached `done`) when the
cancellation landed - true only once the remover step of a reinstall has
actually run - and gives it a distinct message: "Cancelled after the
previous state was already changed - check the protocol status before
retrying".

Files: `src/main/ipc/runOrchestration.ts`, `tests/unit/runOrchestration.test.ts`.

## BUG-11 - Hysteria2 has no foreign-config detection

**Cause:** `ProtocolDetector` fingerprinted a foreign Xray install by
grepping its config for the Reality stream, but had no equivalent check for
Hysteria2 - any Hysteria2 binary+config combination was reported as
`installed`/`broken`, never `foreign`, even one this app never wrote. Live:
a fake binary and an unrelated config.yaml showed as "NOT RUNNING" (own,
broken install) instead of a foreign config warning.

**Fix:** Every config this app writes points its masquerade proxy at the
same fixed URL (`Hysteria2Installer.MASQUERADE_URL`, now exported).
`ProtocolDetector.detectHysteria2()` greps for it the same way Xray's
detector greps for the Reality stream, and reports `foreign` when it's
missing. Also fixed `protocolMeta()` in `protocolCopy.ts`, which had a
single hardcoded "foreign Xray config" message shared across both
protocols - a Hysteria2 foreign result would otherwise have shown a message
about Xray/Reality.

Files: `src/main/domain/ProtocolDetector.ts`,
`src/main/domain/installers/Hysteria2Installer.ts`,
`src/renderer/src/features/select/protocolCopy.ts`,
`tests/unit/ProtocolDetector.test.ts`.

## BUG-12 - session:close is never called from the renderer

**Cause:** `window.uplink.closeSession()` existed in the preload bridge but
nothing in the renderer ever called it. A session stayed alive - occupying
a slot until its own 5-minute idle timeout - even after the user had
navigated back to step 1 to enter different credentials.

**Fix:** `App.tsx`'s "Back" handler now closes the current session before
clearing `checkResult`, wrapped so a session that's already gone (idle
timeout already fired) doesn't surface as an error.

Files: `src/renderer/src/App.tsx`.

## BUG-13 - no explanation for why only Manage is offered

**Cause:** A protocol in `installed`/`broken`/`foreign` state showed only
its state badge and a bare "Manage" button - no text explained what any of
those states actually meant or why installing was blocked. `protocolMeta()`
already existed with exactly this explanation (used only inside the Manage
modal), it just wasn't rendered on the select-step card itself.

**Fix:** The card's manageable branch now renders `protocolMeta()`'s text
above the Manage button, same as the modal already does.

Files: `src/renderer/src/features/select/SelectStep.tsx`.

## BUG-16 - warnings from a fully successful run are never shown

**Cause:** The "Diagnostics" collapsible - the only place `RunResult.warnings`
is rendered (via `buildDiagnosticsReport()`) - only opened when
`failed.length > 0 || result.diagnostics`. Both are false on a run where
every protocol succeeded, so a warning like "ufw is installed but not
active" (confirmed live) was silently dropped even though the app had
already recorded it correctly.

**Fix:** Added `|| result.warnings.length > 0` to the collapsible's render
condition. `buildDiagnosticsReport()` already included the warnings section
unconditionally, so no further change was needed.

Files: `src/renderer/src/features/result/ResultStep.tsx`.

## BUG-17/BUG-22 - E_NO_REALITY_DONOR hint always blames the built-in list

**Cause:** `ERROR_TEXT['E_NO_REALITY_DONOR'].hint` is a single static string
("None of the built-in candidates passed the check") shown regardless of
whether the built-in list was actually checked, or a user-supplied SNI
replaced it entirely and was the only thing checked. The correct
distinction already existed in `InstallerError.message` (diagnostics-only,
not shown as the primary hint) - `AppError.hint` was defined in the
contract for exactly this and was never populated by anyone, nor ever read
by the UI.

**Fix:** `ErrorDetailsModal` now shows `error.hint` when the failure
provided one, falling back to the static `ERROR_TEXT` hint otherwise.
`XrayRealityInstaller.selectDonor()` now passes a donor-specific hint when
`params.realitySni` was set, naming the actual domain that failed instead
of blaming a list that was never consulted.

## BUG-21 - E_DOWNLOAD_FAILED hint always blames the network

**Cause:** Same static-hint gap as BUG-17/22, different code: `installCore()`
in both installers threw `E_DOWNLOAD_FAILED` on any non-zero exit from the
install script's retries, and the UI hint is hardcoded to "check the
server's network connection" - live: a full disk (`No space left on
device`) produced this exact same misleading advice.

**Fix:** New `BaseInstaller.downloadFailureHint()` inspects the last failed
attempt's stdout/stderr for the disk-full message and returns a matching
hint; both installers now pass its result as `InstallerError`'s hint.
Falls through to the static network-ish hint when nothing recognizable
is found - never invents a cause it isn't sure of.

Files: `src/renderer/src/features/common/ErrorDetailsModal.tsx`,
`src/main/domain/installers/BaseInstaller.ts`,
`src/main/domain/installers/XrayRealityInstaller.ts`,
`src/main/domain/installers/Hysteria2Installer.ts`,
`tests/unit/XrayRealityInstaller.test.ts`.
