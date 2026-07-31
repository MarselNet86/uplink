export interface X25519KeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Parses `xray x25519` output into {privateKey, publicKey} regardless of
 * CLI version (tech.md 5.6 X3 / pitfall #1). Old builds print
 * "Private key:"/"Public key:"; v25.3.6+ prints "PrivateKey:"/"Password:"
 * (Password is the renamed public key) plus an unrelated "Hash32:" line
 * that must never be mistaken for the public key. Parsed as a key-value
 * map, not positionally, so both layouts work without version detection.
 */
export function parseX25519Output(stdout: string): X25519KeyPair {
  const fields = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields.set(key, value);
  }

  const privateKey = fields.get('PrivateKey') ?? fields.get('Private key');
  const publicKey = fields.get('Password') ?? fields.get('Public key');

  if (!privateKey || !publicKey) {
    throw new Error(`unrecognized "xray x25519" output: ${stdout}`);
  }

  return { privateKey, publicKey };
}
