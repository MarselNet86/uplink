import type { ErrorCode } from '@shared/errors';

export interface ErrorText {
  title: string;
  hint: string;
}

/**
 * Single source of user-facing copy per ErrorCode (tech.md section 8/10.2):
 * main returns codes and terse diagnostics, this table owns the words the
 * user actually sees.
 */
export const ERROR_TEXT: Record<ErrorCode, ErrorText> = {
  E_NET_UNREACHABLE: {
    title: 'Server is unreachable',
    hint: 'Check the IP, port, and that the server is on and accepting connections.',
  },
  E_SSH_AUTH: {
    title: 'Failed to authenticate over SSH',
    hint: 'Check the username and password.',
  },
  E_SSH_HOSTKEY_MISMATCH: {
    title: 'The server fingerprint has changed',
    hint: 'This can mean the server OS was reinstalled, or a man-in-the-middle attack. If you are sure this is your server, remove it from known_hosts.json.',
  },
  E_TIMEOUT: {
    title: 'Timed out',
    hint: 'The server is responding too slowly. Try again.',
  },
  E_NO_SUDO: {
    title: 'No administrator privileges',
    hint: 'The user must be root or have passwordless sudo access.',
  },
  E_DISTRO_UNSUPPORTED: {
    title: 'Distribution is not supported',
    hint: 'Uplink only works with Debian and Ubuntu.',
  },
  E_ARCH_UNSUPPORTED: {
    title: 'Architecture is not supported',
    hint: 'Only x86_64 and aarch64 are supported.',
  },
  E_NO_SYSTEMD: {
    title: 'systemd not found',
    hint: 'The server needs systemd to manage services.',
  },
  E_NO_OUTBOUND: {
    title: 'No outbound internet access',
    hint: 'The server needs to download packages. Check the outbound firewall.',
  },
  E_APT_LOCKED: {
    title: 'apt is busy with another process',
    hint: 'Wait for automatic updates to finish, then check again.',
  },
  E_PORT_BUSY: {
    title: 'Required port is in use',
    hint: 'Free up port 443 (or 80 for ACME) from whatever process is using it.',
  },
  E_DNS_MISMATCH: {
    title: "Domain's A record does not point to the server",
    hint: "Update the domain's DNS record and check again.",
  },
  E_ACME_FAILED: {
    title: 'Failed to issue certificate',
    hint: 'Check the A record, port 80 availability, and Let’s Encrypt rate limits.',
  },
  E_NO_REALITY_DONOR: {
    title: 'No donor domain found for Reality',
    hint: 'None of the built-in candidates passed the check. Try again later.',
  },
  E_CERT_GENERATION_FAILED: {
    title: 'Failed to generate certificate',
    hint: 'openssl is missing or broken on the server.',
  },
  E_DOWNLOAD_FAILED: {
    title: 'Failed to download package',
    hint: "Check the server's network connection and try again.",
  },
  E_CONFIG_INVALID: {
    title: 'Configuration failed validation',
    hint: 'Changes were rolled back, the service was not touched.',
  },
  E_SERVICE_FAILED: {
    title: 'Service failed to start',
    hint: 'See the diagnostics for details.',
  },
  E_ALREADY_INSTALLED: {
    title: 'Protocol is already installed',
    hint: 'Use Manage to reinstall or remove it.',
  },
  E_FOREIGN_CONFIG: {
    title: 'Found a foreign config',
    hint: 'Xray without Reality is already on the server. Installation is not possible, only removal is available.',
  },
  E_CANCELLED: {
    title: 'Cancelled',
    hint: 'The operation was stopped at your request.',
  },
  E_UNKNOWN: {
    title: 'Unknown error',
    hint: 'Try again. If the error keeps happening, check the diagnostics.',
  },
};
