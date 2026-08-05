import { shellQuote } from '../security/shellQuote';
import type { ICommandRunner } from '../ssh/types';
import { InstallerError } from './installers/InstallerError';
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
 *
 * The three `-addext` flags are not cosmetic, each fixes a client that
 * otherwise refuses the certificate:
 *
 * - `subjectAltName`: Go dropped CN-based hostname matching in 1.15, and
 *   both Xray-core and hysteria itself are Go. A CN-only certificate can
 *   never match `sni`, so the name has to be repeated in a SAN.
 * - `basicConstraints=CA:FALSE`: `openssl req -x509` defaults to CA:TRUE.
 *   Xray-core matches `pinnedPeerCertSha256` and *then* still demands a
 *   CA -> leaf chain; a lone CA certificate has no leaf and the handshake
 *   fails despite the correct pin (XTLS/Xray-core#5904, #5655).
 * - `keyUsage`/`extendedKeyUsage`: `digitalSignature` only - the key is
 *   prime256v1, so `keyEncipherment` (RSA key transport) does not apply.
 *
 * `-addext` needs openssl 1.1.1+, which every supported distro has
 * (Debian 10+, Ubuntu 18.04+ - see DistroDetector's allow-list).
 */
export async function generateSelfSignedCert(
  runner: ICommandRunner,
  commonName: string,
): Promise<GeneratedCert> {
  const keygen = await runner.runPrivileged(
    `openssl ecparam -genkey -name prime256v1 -out ${shellQuote(KEY_PATH)}`,
  );
  // None of these openssl steps' exit codes were ever checked (BUG-23:
  // E_CERT_GENERATION_FAILED was declared in the contract but never
  // reachable) - a failure here silently produced a missing/empty key or
  // cert, and parseCertFingerprint's own exception on the garbage result
  // surfaced as an unrelated generic error instead of naming the real cause.
  if (keygen.code !== 0) {
    throw new InstallerError(
      'E_CERT_GENERATION_FAILED',
      `openssl ecparam failed: ${keygen.stderr}`,
    );
  }

  const certgen = await runner.runPrivileged(
    `openssl req -new -x509 -days ${CERT_DAYS} -key ${shellQuote(KEY_PATH)} ` +
      `-out ${shellQuote(CERT_PATH)} -subj ${shellQuote(`/CN=${commonName}`)} ` +
      `-addext ${shellQuote(`subjectAltName=DNS:${commonName}`)} ` +
      `-addext ${shellQuote('basicConstraints=critical,CA:FALSE')} ` +
      `-addext ${shellQuote('keyUsage=critical,digitalSignature')} ` +
      `-addext ${shellQuote('extendedKeyUsage=serverAuth')}`,
  );
  if (certgen.code !== 0) {
    throw new InstallerError('E_CERT_GENERATION_FAILED', `openssl req failed: ${certgen.stderr}`);
  }

  // Generated as root over the exec channel, but hysteria-server.service
  // reads these as its own `hysteria` user (same hazard as the config file
  // in Hysteria2Installer.writeConfig) - chmod alone leaves them unreadable.
  await runner.runPrivileged(`chmod 600 ${shellQuote(KEY_PATH)} ${shellQuote(CERT_PATH)}`);
  await runner.runPrivileged(
    `chown hysteria:hysteria ${shellQuote(KEY_PATH)} ${shellQuote(CERT_PATH)}`,
  );

  const fingerprintResult = await runner.runPrivileged(
    `openssl x509 -noout -fingerprint -sha256 -in ${shellQuote(CERT_PATH)}`,
  );
  if (fingerprintResult.code !== 0) {
    throw new InstallerError(
      'E_CERT_GENERATION_FAILED',
      `openssl x509 -fingerprint failed: ${fingerprintResult.stderr}`,
    );
  }
  return {
    keyPath: KEY_PATH,
    certPath: CERT_PATH,
    fingerprint: parseCertFingerprint(fingerprintResult.stdout),
  };
}
