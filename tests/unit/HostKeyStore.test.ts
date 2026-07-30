import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HostKeyStore, computeFingerprint } from '../../src/main/ssh/HostKeyStore';

describe('computeFingerprint', () => {
  it('matches a plain sha256 hex digest, uppercased and colon-free', () => {
    const key = Buffer.from('fake-host-key');
    const expected = createHash('sha256').update(key).digest('hex').toUpperCase();
    expect(computeFingerprint(key)).toBe(expected);
  });
});

describe('HostKeyStore', () => {
  let dir: string;
  let storePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uplink-known-hosts-'));
    storePath = join(dir, 'nested', 'known_hosts.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports unknown for a host never seen before', async () => {
    const store = new HostKeyStore(storePath);
    await expect(store.check('example.com', 22, 'AABB')).resolves.toBe('unknown');
  });

  it('reports match after trusting the same fingerprint', async () => {
    const store = new HostKeyStore(storePath);
    await store.trust('example.com', 22, 'AABB');
    await expect(store.check('example.com', 22, 'AABB')).resolves.toBe('match');
  });

  it('reports mismatch when the fingerprint changed', async () => {
    const store = new HostKeyStore(storePath);
    await store.trust('example.com', 22, 'AABB');
    await expect(store.check('example.com', 22, 'CCDD')).resolves.toBe('mismatch');
  });

  it('keys by host and port independently', async () => {
    const store = new HostKeyStore(storePath);
    await store.trust('example.com', 22, 'AABB');
    await expect(store.check('example.com', 2222, 'AABB')).resolves.toBe('unknown');
  });

  it('persists across store instances backed by the same path', async () => {
    await new HostKeyStore(storePath).trust('example.com', 22, 'AABB');
    const reopened = new HostKeyStore(storePath);
    await expect(reopened.check('example.com', 22, 'AABB')).resolves.toBe('match');
  });
});
