import { useState } from 'react';
import type { ProtocolId } from '@shared/types';
import { useAppStore } from './store/useAppStore';
import { KitchenSink } from './features/common/KitchenSink';
import { WizardShell } from './features/common/WizardShell';
import { ConnectForm } from './features/connect/ConnectForm';
import { HostKeyPromptModal } from './features/connect/HostKeyPromptModal';
import { ConflictModal } from './features/manage/ConflictModal';
import { SelectStep } from './features/select/SelectStep';

export default function App() {
  const route = useAppStore((state) => state.route);
  const setRoute = useAppStore((state) => state.setRoute);
  const checkResult = useAppStore((state) => state.checkResult);
  const setCheckResult = useAppStore((state) => state.setCheckResult);
  const [manageOpen, setManageOpen] = useState(false);

  const foundProtocols = checkResult?.protocols.filter((p) => p.state !== 'absent') ?? [];

  return (
    <>
      <button
        type="button"
        className="eyebrow fixed right-2 top-2 z-50 cursor-pointer bg-transparent"
        onClick={() => setRoute(route === 'wizard' ? 'kitchen-sink' : 'wizard')}
      >
        {route === 'wizard' ? 'kitchen sink' : 'wizard'}
      </button>

      {route === 'kitchen-sink' && <KitchenSink />}

      {route === 'wizard' && (
        <WizardShell
          step={checkResult ? 2 : 1}
          caption={
            checkResult
              ? 'Reality занимает 443 по TCP, Hysteria2 — 443 по UDP. Ставятся вместе.'
              : 'Собственный сервер, два протокола, ни одного ручного конфига. Домен не требуется.'
          }
        >
          {checkResult ? (
            <SelectStep
              result={checkResult}
              onBack={() => setCheckResult(null)}
              onManage={() => setManageOpen(true)}
              onInstall={(protocols: ProtocolId[]) => {
                // Wired to install:start once the pipeline lands (stage 5).
                void protocols;
              }}
            />
          ) : (
            <ConnectForm onChecked={setCheckResult} />
          )}
        </WizardShell>
      )}

      {checkResult && (
        <ConflictModal
          open={manageOpen}
          found={foundProtocols}
          onClose={() => setManageOpen(false)}
          onRemove={() => setManageOpen(false)}
          onReinstall={() => setManageOpen(false)}
        />
      )}

      <HostKeyPromptModal />
    </>
  );
}
