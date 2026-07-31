const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const AUTH_RE = /(auth:\s*)\S+/gi;
const PRIVATE_KEY_RE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/**
 * Masks secrets before text reaches RunResult.diagnostics or the logger
 * (tech.md 10.1). The SSH/Hysteria2 password never enters a command string
 * or command output in the first place (CommandRunner pipes it over stdin
 * only), so this only needs to catch what *could* leak through raw
 * stdout/stderr or error messages: UUIDs, PEM private keys, and `auth:`
 * fields. Any caller-known secret literals can additionally be passed in.
 */
export function redact(text: string, knownSecrets: readonly string[] = []): string {
  let out = text;
  for (const secret of knownSecrets) {
    if (!secret) continue;
    out = out.split(secret).join('[redacted]');
  }
  out = out.replace(PRIVATE_KEY_RE, '[private key]');
  out = out.replace(UUID_RE, '[uuid]');
  out = out.replace(AUTH_RE, '$1[redacted]');
  return out;
}
