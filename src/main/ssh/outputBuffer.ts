/**
 * Appends a chunk to a growing command output buffer, keeping it under
 * maxBytes by dropping from the start once exceeded (tech.md 5.1: stdout
 * and stderr are capped at 256 KiB per command, overflow drops the head).
 */
export function appendCapped(current: string, chunk: string, maxBytes: number): string {
  const combined = current + chunk;
  const size = Buffer.byteLength(combined, 'utf8');
  if (size <= maxBytes) return combined;
  return Buffer.from(combined, 'utf8')
    .subarray(size - maxBytes)
    .toString('utf8');
}
