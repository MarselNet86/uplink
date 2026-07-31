import { create } from 'zustand';
import type { CheckResult, DeployParams, RunResult, StepView } from '@shared/types';

export type RouteId = 'wizard' | 'kitchen-sink';

interface RunState {
  runId: string;
  steps: StepView[];
  percent: number;
  note: string | null;
  result: RunResult | null;
}

interface AppState {
  route: RouteId;
  setRoute: (route: RouteId) => void;
  checkResult: CheckResult | null;
  setCheckResult: (result: CheckResult | null) => void;
  deployParams: DeployParams | null;
  setDeployParams: (params: DeployParams | null) => void;
  run: RunState | null;
  startRun: (runId: string) => void;
  setRunSteps: (steps: StepView[]) => void;
  setRunStep: (stepId: StepView['id'], status: StepView['status'], percent: number) => void;
  setRunNote: (message: string) => void;
  finishRun: (result: RunResult) => void;
  resetRun: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  route: 'wizard',
  setRoute: (route) => set({ route }),
  checkResult: null,
  setCheckResult: (checkResult) => set({ checkResult }),
  deployParams: null,
  setDeployParams: (deployParams) => set({ deployParams }),
  run: null,
  startRun: (runId) => set({ run: { runId, steps: [], percent: 0, note: null, result: null } }),
  setRunSteps: (steps) => set((state) => (state.run ? { run: { ...state.run, steps } } : state)),
  setRunStep: (stepId, status, percent) =>
    set((state) => {
      if (!state.run) return state;
      const steps = state.run.steps.map((step) =>
        step.id === stepId ? { ...step, status } : step,
      );
      return { run: { ...state.run, steps, percent } };
    }),
  setRunNote: (message) =>
    set((state) => (state.run ? { run: { ...state.run, note: message } } : state)),
  finishRun: (result) => set((state) => (state.run ? { run: { ...state.run, result } } : state)),
  resetRun: () => set({ run: null }),
}));
