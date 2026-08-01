/**
 * Built-in Reality TLS-masquerade donor candidates (tech.md 5.6 X4).
 * XrayRealityInstaller tries each in order and uses the first that passes
 * both donor checks. Editing this list is a core-version-bump change per
 * tech.md's own rule.
 *
 * Ordered by certificate chain size, smallest first: REALITY relays the
 * donor's handshake through a fixed-size buffer, and an oversized chain
 * breaks the connection *after* the client has already authenticated - from
 * the outside that looks like "service running, port listening, no traffic".
 * `www.microsoft.com` was dropped in v4 for exactly that reason (8126-byte
 * RSA chain, reproduced end-to-end on a real server); every entry below was
 * verified to actually carry traffic.
 */
export const REALITY_DONORS: readonly string[] = [
  'www.cloudflare.com', // 3540 bytes
  'www.swift.com', // 4127 bytes
  'www.apple.com', // 4484 bytes
];

/**
 * Upper bound for a donor's certificate chain, in bytes of PEM as measured
 * by the openssl pipeline in tech.md 5.6 X4. Sits between the largest
 * verified-good chain (dl.google.com, 6728) and the smallest verified-bad
 * one (www.microsoft.com, 8126). The exact cutoff is not documented
 * upstream, so this is deliberately conservative rather than precise.
 */
export const MAX_DONOR_CERT_BYTES = 7_000;
