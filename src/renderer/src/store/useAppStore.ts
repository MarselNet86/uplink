import { create } from 'zustand';
import type {
  AppError,
  CheckResult,
  DeployParams,
  RefreshResult,
  RunResult,
  StepView,
} from '@shared/types';

interface RunState {
  runId: string;
  steps: StepView[];
  percent: number;
  note: string | null;
  result: RunResult | null;
}

/** One failure that has no step of its own to render it, e.g. a stale
 * session rejecting install:start. Surfaced app-wide as a modal so it can
 * never be swallowed silently. */
interface FatalError {
  error: AppError;
  context: string;
}

interface AppState {
  fatalError: FatalError | null;
  setFatalError: (fatal: FatalError | null) => void;
  checkResult: CheckResult | null;
  setCheckResult: (result: CheckResult | null) => void;
  /**
   * Applies a protocols:refresh reading over the ssh:check snapshot, keeping
   * the session and distro (neither can change while the session is open).
   * Preflight has to be replaced along with the protocol list: SelectStep
   * gates Install on `preflight.passed`, so a stale report left step 2 with
   * no way forward after a remove.
   */
  applyRefresh: (result: RefreshResult) => void;
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
  fatalError: null,
  setFatalError: (fatalError) => set({ fatalError }),
  checkResult: null,
  setCheckResult: (checkResult) => set({ checkResult }),
  applyRefresh: ({ preflight, protocols }) =>
    set((state) =>
      state.checkResult ? { checkResult: { ...state.checkResult, preflight, protocols } } : state,
    ),
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
