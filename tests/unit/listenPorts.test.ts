import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findListener, parseListenPorts } from '../../src/main/domain/parsers/listenPorts';

const fixture = readFileSync(join(__dirname, '../fixtures/ss-tulnp.txt'), 'utf8');

describe('parseListenPorts', () => {
  it('parses tcp and udp rows with process names', () => {
    const entries = parseListenPorts(fixture);
    expect(entries).toContainEqual({ protocol: 'tcp', port: 22, process: 'sshd' });
    expect(entries).toContainEqual({ protocol: 'tcp', port: 80, process: 'nginx' });
    expect(entries).toContainEqual({ protocol: 'udp', port: 443, process: 'hysteria' });
  });

  it('parses a `*` wildcard local address (confirmed live: xray with AmbientCapabilities=CAP_NET_BIND_SERVICE binds `*:443`, not `0.0.0.0:443`)', () => {
    const entries = parseListenPorts(fixture);
    expect(entries).toContainEqual({ protocol: 'tcp', port: 443, process: 'xray' });
  });

  it('handles IPv6 local addresses', () => {
    const entries = parseListenPorts(fixture);
    expect(entries.filter((e) => e.protocol === 'tcp' && e.port === 22)).toHaveLength(2);
  });

  it('ignores the header row and blank lines', () => {
    const entries = parseListenPorts(fixture);
    expect(entries.every((e) => e.protocol === 'tcp' || e.protocol === 'udp')).toBe(true);
  });
});

describe('findListener', () => {
  it('finds a busy port by protocol and number', () => {
    const entries = parseListenPorts(fixture);
    expect(findListener(entries, 'udp', 443)).toEqual({
      protocol: 'udp',
      port: 443,
      process: 'hysteria',
    });
  });

  it('returns undefined for a free port', () => {
    const entries = parseListenPorts(fixture);
    expect(findListener(entries, 'tcp', 8080)).toBeUndefined();
  });
});
