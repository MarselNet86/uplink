import { useAppStore } from './store/useAppStore';
import { KitchenSink } from './features/common/KitchenSink';
import { HostKeyPromptModal } from './features/connect/HostKeyPromptModal';

export default function App() {
  const route = useAppStore((state) => state.route);

  return (
    <>
      {route === 'kitchen-sink' && <KitchenSink />}
      <HostKeyPromptModal />
    </>
  );
}
