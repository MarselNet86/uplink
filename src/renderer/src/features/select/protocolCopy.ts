import type { ProtocolId, ProtocolState } from '@shared/types';

export const PROTOCOL_TITLE: Record<ProtocolId, string> = {
  'vless-reality': 'VLESS + Reality',
  hysteria2: 'Hysteria2',
};

export const PROTOCOL_PORT: Record<ProtocolId, string> = {
  'vless-reality': '443/tcp',
  hysteria2: '443/udp',
};

const DEFAULT_META: Record<ProtocolId, string> = {
  'vless-reality': 'Disguised as a third party’s TLS. No domain needed.',
  hysteria2: 'Self-signed certificate. No domain needed.',
};

const STATE_META: Partial<Record<ProtocolState, string>> = {
  installed: 'Found on the server, service is active.',
  broken: 'Found on the server, service is not running.',
  foreign: 'Found a foreign Xray config without Reality.',
};

export function protocolMeta(protocol: ProtocolId, state: ProtocolState): string {
  return STATE_META[state] ?? DEFAULT_META[protocol];
}

export const PROTOCOL_BADGE: Record<
  ProtocolState,
  { label: string; tone: 'default' | 'success' | 'danger' }
> = {
  absent: { label: '', tone: 'default' },
  installed: { label: 'Installed', tone: 'success' },
  broken: { label: 'Not running', tone: 'default' },
  foreign: { label: 'Foreign config', tone: 'danger' },
};
