export interface ListenEntry {
  protocol: 'tcp' | 'udp';
  port: number;
  process?: string;
}

/**
 * Parses `ss -tulnp` output into listening sockets. Column layout:
 * Netid State Recv-Q Send-Q "Local Address:Port" "Peer Address:Port" Process.
 * Only tcp/udp rows are kept; the process name is pulled out of the
 * `users:(("name",pid=...))` suffix when present (needs root to populate).
 */
export function parseListenPorts(stdout: string): ListenEntry[] {
  const lines = stdout.split('\n').slice(1);
  const entries: ListenEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const columns = trimmed.split(/\s+/);
    const netid = columns[0]?.toLowerCase();
    if (netid !== 'tcp' && netid !== 'udp') continue;

    const localAddress = columns[4];
    if (!localAddress) continue;
    const port = extractPort(localAddress);
    if (port === null) continue;

    const processMatch = /\(\("([^"]+)"/.exec(trimmed);
    const entry: ListenEntry = { protocol: netid, port };
    if (processMatch?.[1]) entry.process = processMatch[1];
    entries.push(entry);
  }

  return entries;
}

export function findListener(
  entries: ListenEntry[],
  protocol: 'tcp' | 'udp',
  port: number,
): ListenEntry | undefined {
  return entries.find((e) => e.protocol === protocol && e.port === port);
}

function extractPort(address: string): number | null {
  const idx = address.lastIndexOf(':');
  if (idx === -1) return null;
  const port = Number(address.slice(idx + 1));
  return Number.isInteger(port) && port >= 0 ? port : null;
}
