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

export interface Hysteria2SelfSignedLinkParams {
  password: string;
  host: string; // server IP - the cert isn't issued for a domain, so the link must address it directly
  sni: string; // HYSTERIA_FAKE_SNI, same value the cert's CN was generated with
  fingerprintSha256: string; // no colons, uppercase - from parsers/certFingerprint.ts
}

/**
 * `self-signed` hy2:// link (tech.md 5.9). `insecure=1` is mandatory here:
 * without it the client validates against the system trust store and
 * fails with "unknown authority" for a cert nobody issued. `includePin`
 * defaults to true; set it false for the "link without pin" fallback some
 * clients need (KeyCard toggle) - a deliberate reduction of MITM protection.
 */
export function buildHysteria2SelfSignedLink(
  params: Hysteria2SelfSignedLinkParams,
  includePin = true,
): string {
  const pairs: Array<[string, string]> = [
    ['sni', params.sni],
    ['insecure', '1'],
    ...(includePin ? ([['pinSHA256', params.fingerprintSha256]] as Array<[string, string]>) : []),
  ];
  const query = pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  const userInfo = encodeURIComponent(params.password);
  const fragment = encodeURIComponent('Uplink-HY2');

  return `hy2://${userInfo}@${params.host}:443?${query}#${fragment}`;
}

export interface Hysteria2AcmeLinkParams {
  password: string;
  domain: string; // host in the link is the domain, not the IP - the cert is issued for it
}

/** `acme-domain` hy2:// link (tech.md 5.9): trusted cert, so `insecure=0` and no pin needed. */
export function buildHysteria2AcmeLink(params: Hysteria2AcmeLinkParams): string {
  const query = `sni=${encodeURIComponent(params.domain)}&insecure=0`;
  const userInfo = encodeURIComponent(params.password);
  const fragment = encodeURIComponent('Uplink-HY2');

  return `hy2://${userInfo}@${params.domain}:443?${query}#${fragment}`;
}
