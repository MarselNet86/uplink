import { create } from 'zustand';
import type { CheckResult } from '@shared/types';

export type RouteId = 'wizard' | 'kitchen-sink';

interface AppState {
  route: RouteId;
  setRoute: (route: RouteId) => void;
  checkResult: CheckResult | null;
  setCheckResult: (result: CheckResult | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  route: 'wizard',
  setRoute: (route) => set({ route }),
  checkResult: null,
  setCheckResult: (checkResult) => set({ checkResult }),
}));
