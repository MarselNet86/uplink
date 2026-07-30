import type { ProtocolId } from '@shared/types';
import { Card } from './Card';
import { CopyButton } from './CopyButton';

export interface KeyCardProps {
  protocol: ProtocolId;
  link: string;
}

const protocolTitle: Record<ProtocolId, string> = {
  'vless-reality': 'VLESS + Reality',
  hysteria2: 'Hysteria2',
};

export function KeyCard({ protocol, link }: KeyCardProps) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-[length:var(--t-small)] text-muted">{protocolTitle[protocol]}</span>
      <p className="truncate font-mono text-[12px] text-ink" title={link}>
        {link}
      </p>
      <div>
        <CopyButton value={link} />
      </div>
    </Card>
  );
}
