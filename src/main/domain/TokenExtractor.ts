import type { ProtocolId, ProtocolStatus } from '@shared/types';
import { shellQuote } from '../security/shellQuote';
import type { ICommandRunner } from '../ssh/types';
import {
  buildHysteria2AcmeLink,
  buildHysteria2SelfSignedLink,
  buildVlessLink,
} from './LinkBuilder';
import { parseCertFingerprint } from './parsers/certFingerprint';
import { parseX25519Output } from './parsers/x25519';

/**
 * Reads connection tokens from existing protocol configs on the server and
 * injects them into the ProtocolStatus list. Best-effort: any SSH or parse
 * failure leaves `link` undefined without propagating an error upward — the
 * caller (ssh:check, protocols:refresh) must never fail just because a
 * pre-existing config could not be read.
 */
export class TokenExtractor {
  constructor(
    private readonly runner: ICommandRunner,
    private readonly host: string,
  ) {}

  async enrichWithLinks(statuses: ProtocolStatus[]): Promise<ProtocolStatus[]> {
    return Promise.all(
      statuses.map(async (status) => {
        if (status.state !== 'installed') return status;
        try {
          const link = await this.extractLink(status.protocol);
          return link ? { ...status, link } : status;
        } catch {
          return status;
        }
      }),
    );
  }

  private async extractLink(protocol: ProtocolId): Promise<string | undefined> {
    if (protocol === 'vless-reality') return this.extractVlessLink();
    if (protocol === 'hysteria2') return this.extractHy2Link();
    return undefined;
  }

  private async extractVlessLink(): Promise<string | undefined> {
    const cat = await this.runner.run('cat /usr/local/etc/xray/config.json');
    if (cat.code !== 0) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cfg: any;
    try {
      cfg = JSON.parse(cat.stdout);
    } catch {
      return undefined;
    }

    const uuid: string | undefined = cfg?.inbounds?.[0]?.settings?.clients?.[0]?.id;
    const rs = cfg?.inbounds?.[0]?.streamSettings?.realitySettings;
    const privateKey: string | undefined = rs?.privateKey;
    const shortId: string | undefined = rs?.shortIds?.[0];
    const sni: string | undefined = rs?.serverNames?.[0];

    if (!uuid || !privateKey || !shortId || !sni) return undefined;

    const x25519 = await this.runner.run(`/usr/local/bin/xray x25519 -i ${shellQuote(privateKey)}`);
    if (x25519.code !== 0) return undefined;

    let publicKey: string;
    try {
      ({ publicKey } = parseX25519Output(x25519.stdout));
    } catch {
      return undefined;
    }

    return buildVlessLink({ uuid, host: this.host, sni, publicKey, shortId });
  }

  private async extractHy2Link(): Promise<string | undefined> {
    const cat = await this.runner.run('cat /etc/hysteria/config.yaml');
    if (cat.code !== 0) return undefined;
    const yaml = cat.stdout;

    const passwordMatch = /password:\s*"([^"]+)"/.exec(yaml);
    const password = passwordMatch?.[1];
    if (!password) return undefined;

    if (/^acme:/m.test(yaml)) {
      const domainMatch = /domains:\s*\n\s*-\s*"([^"]+)"/m.exec(yaml);
      const domain = domainMatch?.[1];
      if (!domain) return undefined;
      return buildHysteria2AcmeLink({ password, domain });
    }

    // Self-signed: read fingerprint and derive SNI from cert CN.
    const fpResult = await this.runner.run(
      'openssl x509 -noout -fingerprint -sha256 -in /etc/hysteria/server.crt 2>/dev/null',
    );
    if (fpResult.code !== 0) return undefined;

    let fingerprintSha256: string;
    try {
      fingerprintSha256 = parseCertFingerprint(fpResult.stdout);
    } catch {
      return undefined;
    }

    const subjectResult = await this.runner.run(
      'openssl x509 -noout -subject -in /etc/hysteria/server.crt 2>/dev/null',
    );
    // Handles both "subject=CN = bing.com" (OpenSSL 3.x) and "/CN=bing.com" (older).
    const cnMatch = /CN\s*=\s*(\S+)/.exec(subjectResult.stdout ?? '');
    const sni = cnMatch?.[1] ?? 'bing.com';

    return buildHysteria2SelfSignedLink({ password, host: this.host, sni, fingerprintSha256 });
  }
}
