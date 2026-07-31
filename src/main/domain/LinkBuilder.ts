export interface VlessLinkParams {
  uuid: string;
  host: string;
  sni: string;
  publicKey: string;
  shortId: string;
}

/**
 * Builds the vless:// connection link for the Reality inbound (tech.md
 * 5.9). Pure function, no side effects: every dynamic segment is
 * percent-encoded independently so special characters in any field can
 * never break the URL or leak into an adjacent query parameter.
 */
export function buildVlessLink(params: VlessLinkParams): string {
  const pairs: Array<[string, string]> = [
    ['type', 'tcp'],
    ['security', 'reality'],
    ['encryption', 'none'],
    ['flow', 'xtls-rprx-vision'],
    ['sni', params.sni],
    ['fp', 'chrome'],
    ['pbk', params.publicKey],
    ['sid', params.shortId],
    ['spx', '/'],
  ];
  const query = pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

  const userInfo = encodeURIComponent(params.uuid);
  const fragment = encodeURIComponent('Uplink-VLESS');

  return `vless://${userInfo}@${params.host}:443?${query}#${fragment}`;
}
