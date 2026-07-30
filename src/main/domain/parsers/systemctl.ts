export type ServiceState =
  'active' | 'inactive' | 'failed' | 'activating' | 'deactivating' | 'unknown';

const KNOWN_STATES: readonly ServiceState[] = [
  'active',
  'inactive',
  'failed',
  'activating',
  'deactivating',
];

/**
 * `systemctl is-active` prints the state on stdout and exits non-zero for
 * anything but `active` - that non-zero code is not an execution failure
 * (tech.md pitfall #10), so this parser only looks at stdout.
 */
export function parseIsActive(stdout: string): ServiceState {
  const word = stdout.trim();
  return (KNOWN_STATES as readonly string[]).includes(word) ? (word as ServiceState) : 'unknown';
}
