import type { ErrorCode } from './errors';

/** Domain DTOs shared between main and renderer. Frozen contract - see tech.md section 7 (v2). */

export type ProtocolId = 'vless-reality' | 'hysteria2';

export type DistroId = 'debian' | 'ubuntu';

export interface ServerCredentials {
  host: string;
  port: number;
  username: string;
  password: string; // main-only, never written to disk
}

export type TlsMode = 'self-signed' | 'acme-domain';

export interface DeployParams {
  distroHint: DistroId | 'auto';
  tlsMode: TlsMode; // default 'self-signed', domain not required
  domain?: string; // required only when tlsMode === 'acme-domain'
  acmeEmail?: string; // required only when tlsMode === 'acme-domain'
}

export interface DistroInfo {
  id: DistroId;
  versionId: string; // '24.04', '13'
  prettyName: string;
  arch: 'x86_64' | 'aarch64';
  hasSystemd: boolean;
}

export type CheckId =
  | 'tcp'
  | 'auth'
  | 'privileges'
  | 'distro'
  | 'arch'
  | 'systemd'
  | 'outbound'
  | 'ports'
  | 'dns'
  | 'apt-lock';
// 'dns' is present in PreflightReport.items only when tlsMode === 'acme-domain'.

export interface CheckItem {
  id: CheckId;
  status: 'ok' | 'warn' | 'fail';
  detail?: string; // already redacted, no secrets
}

export interface PreflightReport {
  items: CheckItem[];
  passed: boolean;
}

export type ProtocolState = 'absent' | 'installed' | 'broken' | 'foreign';

export interface ProtocolStatus {
  protocol: ProtocolId;
  state: ProtocolState;
  version?: string;
  serviceActive: boolean;
}

export interface CheckRequest {
  credentials: ServerCredentials;
  params: DeployParams;
}

export interface CheckResult {
  sessionId: string;
  distro: DistroInfo;
  preflight: PreflightReport;
  protocols: ProtocolStatus[];
}

export type InstallMode = 'install' | 'reinstall';

export interface InstallRequest {
  sessionId: string;
  protocols: ProtocolId[];
  mode: InstallMode;
  params: DeployParams;
}

export interface RemoveRequest {
  sessionId: string;
  protocols: ProtocolId[];
}

export interface RunHandle {
  runId: string;
}

export type StepId =
  | 'preflight'
  | 'base-packages'
  | 'xray-install'
  | 'xray-donor-select'
  | 'xray-keys'
  | 'xray-config'
  | 'xray-validate'
  | 'xray-start'
  | 'xray-verify'
  | 'hy2-install'
  | 'hy2-secret'
  | 'hy2-cert-generate' // only tlsMode: self-signed
  | 'hy2-config'
  | 'hy2-start'
  | 'hy2-acme-wait' // only tlsMode: acme-domain
  | 'hy2-verify'
  | 'firewall'
  | 'backup'
  | 'xray-remove'
  | 'hy2-remove';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepView {
  id: StepId;
  title: string;
  status: StepStatus;
}

export type ProgressEvent =
  | { runId: string; type: 'started'; steps: StepView[] }
  | { runId: string; type: 'step'; stepId: StepId; status: StepStatus; percent: number }
  | { runId: string; type: 'note'; message: string }
  | { runId: string; type: 'finished'; result: RunResult };

export interface ProtocolOutcome {
  protocol: ProtocolId;
  ok: boolean;
  link?: string;
  error?: AppError;
}

export interface RunResult {
  runId: string;
  ok: boolean; // true if at least one protocol succeeded
  outcomes: ProtocolOutcome[];
  warnings: string[];
  diagnostics?: string; // passed through redact(), only on error
}

export interface AppError {
  code: ErrorCode;
  message: string; // ru, user-facing
  hint?: string; // what to do
}
