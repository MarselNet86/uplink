/** Lightweight client-side field validation, tech.md section 4. The zod
 * schemas validate the same payload again at the IPC boundary; this layer
 * only exists to show inline hints before a round trip to main. */
export interface ConnectFormValues {
  host: string;
  port: string;
  username: string;
  password: string;
  /** True when the user opted to type their own domain/email instead of the sslip.io default. */
  domainOverride: boolean;
  domain: string;
  acmeEmail: string;
  /** Optional donor override for Reality; empty means "pick automatically" (tech.md 5.6 X4). */
  realitySni: string;
  /** Optional masquerade SNI for Hysteria2 self-signed; empty means the built-in default. */
  hysteriaSni: string;
}

export type ConnectFormErrors = Partial<Record<keyof ConnectFormValues, string>>;

const HOST_RE = /^[a-zA-Z0-9.:\-[\]]+$/;
const FQDN_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

/**
 * Free, registration-less ACME domain for Hysteria2, derived from whatever
 * the user already typed in "IP or host" - no separate purchase or signup
 * needed for the default path. Two cases actually resolve to the server:
 *
 * - an IPv4 host gets the sslip.io wildcard suffix (`1.2.3.4.sslip.io`
 *   resolves to `1.2.3.4` with no registration - see sslip.io);
 * - a host that's already a domain is reused as-is, since SSH just
 *   connected to it, so it necessarily resolves to this server too.
 *
 * IPv6 hosts and anything else return '' (sslip.io's IPv6 form needs
 * dash-encoding, out of scope for the auto path) - callers fall back to
 * `self-signed` rather than guess.
 */
export function deriveAutoDomain(host: string): string {
  const trimmed = host.trim();
  if (IPV4_RE.test(trimmed)) return `${trimmed}.sslip.io`;
  if (FQDN_RE.test(trimmed)) return trimmed;
  return '';
}

/** Placeholder ACME contact for the auto domain path - Let's Encrypt only needs a syntactically valid address, never sent anywhere unless the cert is about to expire. */
export function deriveAutoAcmeEmail(domain: string): string {
  return `admin@${domain}`;
}

export function validateConnectForm(values: ConnectFormValues): ConnectFormErrors {
  const errors: ConnectFormErrors = {};

  if (!values.host.trim() || !HOST_RE.test(values.host.trim())) {
    errors.host = 'Enter an IPv4, IPv6, or domain';
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.port = 'Port must be between 1 and 65535';
  }

  if (!values.username.trim() || /\s/.test(values.username)) {
    errors.username = 'Enter a username with no spaces';
  }

  if (!values.password) {
    errors.password = 'Enter a password';
  }

  if (values.domainOverride) {
    if (!FQDN_RE.test(values.domain.trim())) {
      errors.domain = 'Enter a domain, e.g. vpn.example.com';
    }
    if (!EMAIL_RE.test(values.acmeEmail.trim())) {
      errors.acmeEmail = 'Enter an email like you@example.com';
    }
  }

  // Both SNI fields are optional; only validate what was actually typed.
  if (values.realitySni.trim() && !FQDN_RE.test(values.realitySni.trim())) {
    errors.realitySni = 'Enter a domain, e.g. www.cloudflare.com';
  }
  if (values.hysteriaSni.trim() && !FQDN_RE.test(values.hysteriaSni.trim())) {
    errors.hysteriaSni = 'Enter a domain, e.g. bing.com';
  }

  return errors;
}
