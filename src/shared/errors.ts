/** Error codes. Frozen contract - see tech.md section 8 (v2). */
export type ErrorCode =
  | 'E_NET_UNREACHABLE'
  | 'E_SSH_AUTH'
  | 'E_SSH_HOSTKEY_MISMATCH'
  | 'E_TIMEOUT'
  | 'E_NO_SUDO'
  | 'E_DISTRO_UNSUPPORTED'
  | 'E_ARCH_UNSUPPORTED'
  | 'E_NO_SYSTEMD'
  | 'E_NO_OUTBOUND'
  | 'E_APT_LOCKED'
  | 'E_PORT_BUSY'
  | 'E_DNS_MISMATCH' // only tlsMode: acme-domain
  | 'E_ACME_FAILED' // only tlsMode: acme-domain
  | 'E_NO_REALITY_DONOR' // no built-in donor passed xray tls ping
  | 'E_CERT_GENERATION_FAILED' // only tlsMode: self-signed, openssl failure
  | 'E_DOWNLOAD_FAILED'
  | 'E_CONFIG_INVALID'
  | 'E_SERVICE_FAILED'
  | 'E_ALREADY_INSTALLED'
  | 'E_FOREIGN_CONFIG'
  | 'E_CANCELLED'
  | 'E_UNKNOWN';
