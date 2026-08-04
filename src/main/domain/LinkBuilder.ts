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
    // firefox, not chrome: some mobile carriers cut the TLS handshake by
    // Chrome's fingerprint - the TCP connection comes up, then gets killed
    // (client log shows `[EOF] > all retry attempts failed`). Measured live
    // with strictly alternating requests: chrome 0/8, firefox 8/8 in the
    // same window.
    ['fp', 'firefox'],
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
 * `self-signed` hy2:// link (tech.md 5.9), targeting Xray-core clients -
 * INCY, Happ, v2rayN. Deliberately carries no `insecure`: Xray-core
 * removed `allowInsecure` behind a hard date check that went live on
 * 2026-06-01, and past it the whole config is refused, not just the one
 * outbound. Reproduced verbatim against Xray 26.3.27:
 *
 *   Failed to start: ... Failed to build TLS config. > The feature
 *   "allowInsecure" has been removed and migrated to "pinnedPeerCertSha256".
 *
 * `pinSHA256` is therefore load-bearing rather than optional - it is the
 * only thing that lets a client accept a certificate nobody issued, and
 * it verifies by fingerprint instead of by trust chain. A variant without
 * it cannot connect at all, so no such variant is offered.
 *
 * The trade-off is deliberate: native hysteria and sing-box clients still
 * *require* `insecure`, and pinning alone does not satisfy them (verified:
 * they fail the handshake on x509 verification). Those clients are out of
 * scope for this link; `acme-domain` mode serves them with a real
 * certificate.
 */
export function buildHysteria2SelfSignedLink(params: Hysteria2SelfSignedLinkParams): string {
  const pairs: Array<[string, string]> = [
    ['sni', params.sni],
    ['pinSHA256', params.fingerprintSha256],
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
