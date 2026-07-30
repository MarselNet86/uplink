/** Lightweight client-side field validation, tech.md section 4. The zod
 * schemas validate the same payload again at the IPC boundary; this layer
 * only exists to show inline hints before a round trip to main. */
export interface ConnectFormValues {
  distroHint: 'auto' | 'debian' | 'ubuntu';
  host: string;
  port: string;
  username: string;
  password: string;
  domainEnabled: boolean;
  domain: string;
  acmeEmail: string;
}

export type ConnectFormErrors = Partial<Record<keyof ConnectFormValues, string>>;

const HOST_RE = /^[a-zA-Z0-9.:\-[\]]+$/;
const FQDN_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateConnectForm(values: ConnectFormValues): ConnectFormErrors {
  const errors: ConnectFormErrors = {};

  if (!values.host.trim() || !HOST_RE.test(values.host.trim())) {
    errors.host = 'Введите IPv4, IPv6 или домен';
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.port = 'Порт вне диапазона 1—65535';
  }

  if (!values.username.trim() || /\s/.test(values.username)) {
    errors.username = 'Введите имя пользователя без пробелов';
  }

  if (!values.password) {
    errors.password = 'Введите пароль';
  }

  if (values.domainEnabled) {
    if (!FQDN_RE.test(values.domain.trim())) {
      errors.domain = 'Введите домен, например vpn.example.com';
    }
    if (!EMAIL_RE.test(values.acmeEmail.trim())) {
      errors.acmeEmail = 'Введите почту в формате you@example.com';
    }
  }

  return errors;
}
