import { create } from 'zustand';

export type RouteId = 'wizard' | 'kitchen-sink';

interface AppState {
  route: RouteId;
  setRoute: (route: RouteId) => void;
}

// No wizard screens exist yet (see tech.md roadmap, stages 1+), so the
// skeleton always boots into kitchen-sink until stage 2 adds a real route.
export const useAppStore = create<AppState>((set) => ({
  route: 'kitchen-sink',
  setRoute: (route) => set({ route }),
}));
