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
  'vless-reality': 'Маскировка под чужой TLS. Домен не нужен.',
  hysteria2: 'Самоподписанный сертификат. Домен не нужен.',
};

const STATE_META: Partial<Record<ProtocolState, string>> = {
  installed: 'Найден на сервере, сервис активен.',
  broken: 'Найден на сервере, сервис не запущен.',
  foreign: 'Найден чужой конфиг Xray без Reality.',
};

export function protocolMeta(protocol: ProtocolId, state: ProtocolState): string {
  return STATE_META[state] ?? DEFAULT_META[protocol];
}

export const PROTOCOL_BADGE: Record<
  ProtocolState,
  { label: string; tone: 'default' | 'success' | 'danger' }
> = {
  absent: { label: '', tone: 'default' },
  installed: { label: 'Установлен', tone: 'success' },
  broken: { label: 'Не запущен', tone: 'default' },
  foreign: { label: 'Чужой конфиг', tone: 'danger' },
};
