import { useAppStore } from './store/useAppStore';
import { KitchenSink } from './features/common/KitchenSink';

export default function App() {
  const route = useAppStore((state) => state.route);

  if (route === 'kitchen-sink') return <KitchenSink />;

  return null;
}
