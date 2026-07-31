/**
 * CN/SAN for the Hysteria2 self-signed certificate and the `sni` query
 * param in its client link (tech.md 5.7 H4s). Not resolved, not routed to -
 * `sniGuard: disable` means the value only exists to give the QUIC
 * ClientHello something to present. Changing it is a core version bump.
 */
export const HYSTERIA_FAKE_SNI = 'bing.com';
