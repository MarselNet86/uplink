import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOsRelease } from '../../src/main/domain/parsers/osRelease';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../fixtures', name), 'utf8');

describe('parseOsRelease', () => {
  it('parses a real Debian 13 os-release', () => {
    const result = parseOsRelease(fixture('os-release-debian13.txt'));
    expect(result).toEqual({
      id: 'debian',
      versionId: '13',
      prettyName: 'Debian GNU/Linux 13 (trixie)',
    });
  });

  it('parses a real Ubuntu 24.04 os-release', () => {
    const result = parseOsRelease(fixture('os-release-ubuntu2404.txt'));
    expect(result).toEqual({
      id: 'ubuntu',
      versionId: '24.04',
      prettyName: 'Ubuntu 24.04.1 LTS',
    });
  });

  it('handles unquoted values and missing fields', () => {
    const result = parseOsRelease('ID=debian\nVERSION_ID=13\n');
    expect(result).toEqual({ id: 'debian', versionId: '13', prettyName: '' });
  });
});
