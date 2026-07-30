import { useAppStore } from './store/useAppStore';
import { KitchenSink } from './features/common/KitchenSink';
import { WizardShell } from './features/common/WizardShell';
import { ConnectForm } from './features/connect/ConnectForm';
import { CheckResultPreview } from './features/connect/CheckResultPreview';
import { HostKeyPromptModal } from './features/connect/HostKeyPromptModal';

export default function App() {
  const route = useAppStore((state) => state.route);
  const setRoute = useAppStore((state) => state.setRoute);
  const checkResult = useAppStore((state) => state.checkResult);
  const setCheckResult = useAppStore((state) => state.setCheckResult);

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
          step={1}
          caption="Собственный сервер, два протокола, ни одного ручного конфига. Домен не требуется."
        >
          {checkResult ? (
            <CheckResultPreview result={checkResult} onBack={() => setCheckResult(null)} />
          ) : (
            <ConnectForm onChecked={setCheckResult} />
          )}
        </WizardShell>
      )}

      <HostKeyPromptModal />
    </>
  );
}
