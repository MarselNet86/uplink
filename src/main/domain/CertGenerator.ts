import { shellQuote } from '../security/shellQuote';
import type { ICommandRunner } from '../ssh/types';
import { parseCertFingerprint } from './parsers/certFingerprint';

const KEY_PATH = '/etc/hysteria/server.key';
const CERT_PATH = '/etc/hysteria/server.crt';
const CERT_DAYS = 36_500; // 100 years - self-signed trust is never chain-validated, rotation adds no protection (tech.md 5.7 H4s).

export interface GeneratedCert {
  keyPath: string;
  certPath: string;
  fingerprint: string; // pinSHA256-compatible, no colons, uppercase
}

/**
 * Generates the Hysteria2 self-signed certificate directly with openssl
 * rather than `hysteria cert` - on 2.9.x that command breaks clients with
 * `tls: internal error` unless `sniGuard: disable` is also set, an
 * avoidable coupling to core-version behavior (tech.md 5.7 H4s).
 */
export async function generateSelfSignedCert(
  runner: ICommandRunner,
  commonName: string,
): Promise<GeneratedCert> {
  await runner.runPrivileged(
    `openssl ecparam -genkey -name prime256v1 -out ${shellQuote(KEY_PATH)}`,
  );
  await runner.runPrivileged(
    `openssl req -new -x509 -days ${CERT_DAYS} -key ${shellQuote(KEY_PATH)} ` +
      `-out ${shellQuote(CERT_PATH)} -subj ${shellQuote(`/CN=${commonName}`)}`,
  );
  await runner.runPrivileged(`chmod 600 ${shellQuote(KEY_PATH)} ${shellQuote(CERT_PATH)}`);

  const fingerprintResult = await runner.runPrivileged(
    `openssl x509 -noout -fingerprint -sha256 -in ${shellQuote(CERT_PATH)}`,
  );
  return {
    keyPath: KEY_PATH,
    certPath: CERT_PATH,
    fingerprint: parseCertFingerprint(fingerprintResult.stdout),
  };
}
