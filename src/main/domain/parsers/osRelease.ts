export interface OsRelease {
  id: string;
  versionId: string;
  prettyName: string;
}

/**
 * Parses `/etc/os-release` KEY=VALUE format into a lookup, then reads out
 * the three fields the app cares about. Values may be double- or
 * single-quoted; quotes are stripped. Unknown/missing fields come back
 * as empty strings - callers decide what to do with an unsupported distro.
 */
export function parseOsRelease(text: string): OsRelease {
  const fields = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = unquote(trimmed.slice(eq + 1).trim());
    fields.set(key, value);
  }
  return {
    id: fields.get('ID') ?? '',
    versionId: fields.get('VERSION_ID') ?? '',
    prettyName: fields.get('PRETTY_NAME') ?? '',
  };
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
