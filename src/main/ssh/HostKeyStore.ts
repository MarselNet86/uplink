import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export type HostKeyDecision = 'match' | 'mismatch' | 'unknown';

type KnownHostsFile = Record<string, string>;

/**
 * Renders a raw host key into the uppercase, colon-free SHA-256 hex string
 * shown to the user and stored for comparison (tech.md 5.1 TOFU).
 */
export function computeFingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').toUpperCase();
}

/**
 * TOFU (trust-on-first-use) store for server host key fingerprints,
 * persisted at `app.getPath('userData')/known_hosts.json` by the caller.
 * Pure fs-backed so it can be unit tested without an Electron runtime.
 */
export class HostKeyStore {
  constructor(private readonly storePath: string) {}

  async check(host: string, port: number, fingerprint: string): Promise<HostKeyDecision> {
    const known = await this.readAll();
    const existing = known[hostKey(host, port)];
    if (!existing) return 'unknown';
    return existing === fingerprint ? 'match' : 'mismatch';
  }

  async trust(host: string, port: number, fingerprint: string): Promise<void> {
    const known = await this.readAll();
    known[hostKey(host, port)] = fingerprint;
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(known, null, 2), 'utf8');
  }

  private async readAll(): Promise<KnownHostsFile> {
    try {
      const raw = await readFile(this.storePath, 'utf8');
      return JSON.parse(raw) as KnownHostsFile;
    } catch {
      return {};
    }
  }
}

function hostKey(host: string, port: number): string {
  return `${host}:${port}`;
}
