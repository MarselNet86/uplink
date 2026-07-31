/**
 * Turns `openssl x509 -noout -fingerprint -sha256 -in ...` output
 * (`SHA256 Fingerprint=AA:BB:CC:...`) into the colon-free uppercase hex
 * string `pinSHA256` expects (tech.md 5.7 H4s).
 */
export function parseCertFingerprint(stdout: string): string {
  const match = /Fingerprint=([0-9A-Fa-f:]+)/.exec(stdout);
  if (!match?.[1]) {
    throw new Error(`unrecognized "openssl x509 -fingerprint" output: ${stdout}`);
  }
  return match[1].replace(/:/g, '').toUpperCase();
}
