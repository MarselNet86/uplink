/**
 * Built-in Reality TLS-masquerade donor candidates (tech.md 5.6 X4). The
 * user never picks or sees this list in the form; XrayRealityInstaller
 * tries each in order via `xray tls ping` and uses the first that passes.
 * Editing this list is a core-version-bump change per tech.md's own rule.
 */
export const REALITY_DONORS: readonly string[] = [
  'www.microsoft.com',
  'www.swift.com',
  'www.cloudflare.com',
];
