import type { ReactNode } from 'react';
import type { ProtocolId } from '@shared/types';
import { CopyButton } from './CopyButton';

export interface KeyCardProps {
  protocol: ProtocolId;
  port: string;
  link: string;
  footerExtra?: ReactNode;
}

const protocolTitle: Record<ProtocolId, string> = {
  'vless-reality': 'VLESS + Reality',
  hysteria2: 'Hysteria2',
};

export function KeyCard({ protocol, port, link, footerExtra }: KeyCardProps) {
  return (
    <div className="keycard">
      <div className="keycard-head">
        <span className="keycard-proto">{protocolTitle[protocol]}</span>
        <span className="eyebrow mono">{port}</span>
      </div>
      <p className="keycard-link">{link}</p>
      <div className="keycard-foot">
        <CopyButton value={link} />
        {footerExtra}
      </div>
    </div>
  );
}
