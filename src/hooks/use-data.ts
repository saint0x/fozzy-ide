import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appDataProvider } from '@/data/provider';
import { logFrontendEvent } from '@/lib/frontend-diagnostics';
import { formatError } from '@/lib/errors';
import { useAppStore } from '@/stores/app-store';
import type { LspDocumentBundle, Run, RunEventEnvelope, Settings, Workspace } from '@/types';

function parseRunMessage(output: string): string | null {
  const trimmed = output.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
  } catch {
    // Fall through to plain-text extraction.
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function describeRunOutcome(run: Run): string {
  const detailed = parseRunMessage(run.stdout) ?? parseRunMessage(run.stderr);
  if (detailed) return detailed;
  const exit = run.exitCode == null ? 'unknown' : String(run.exitCode);
  return `${run.scenarioName} (${run.state}, exit ${exit})`;
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => appDataProvider.workspaces.list(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => appDataProvider.workspaces.get(id),
    enabled: !!id,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useActiveWorkspace(): Workspace | undefined {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { data } = useWorkspaces();
  return data?.find((workspace) => workspace.id === activeWorkspaceId);
}

export function useImportWorkspace() {
  const queryClient = useQueryClient();
  const setActiveWorkspaceId = useAppStore((state) => state.setActiveWorkspaceId);
  const pushNotice = useAppStore((state) => state.pushNotice);
  const setDrawerTab = useAppStore((state) => state.setDrawerTab);
  const markCoverageMapped = useAppStore((state) => state.markCoverageMapped);
  return useMutation({
    mutationFn: (path: string) => appDataProvider.workspaces.import(path),
    onSuccess: async (workspace) => {
      setActiveWorkspaceId(workspace.id);
      queryClient.setQueryData<Workspace[]>(['workspaces'], (current = []) => {
        const next = [workspace, ...current.filter((item) => item.id !== workspace.id)];
        return next;
      });
      queryClient.setQueryData(['workspace', workspace.id], workspace);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      pushNotice({
        tone: 'success',
        title: `Workspace ready: ${workspace.name}`,
        message: 'The workspace is now active across the app.',
      });
      try {
        setDrawerTab('output');
        markCoverageMapped(workspace.id);
        await appDataProvider.workspaces.mapSuites(workspace.id);
        queryClient.invalidateQueries({ queryKey: ['runs'] });
        queryClient.invalidateQueries({ queryKey: ['activity'] });
      } catch (error) {
        pushNotice({
          tone: 'warning',
          title: 'Coverage map failed',
          message: formatError(error),
        });
      }
    },
  });
}

export function useMapSuites() {
  const queryClient = useQueryClient();
  const pushNotice = useAppStore((state) => state.pushNotice);
  const setDrawerTab = useAppStore((state) => state.setDrawerTab);
  const markCoverageMapped = useAppStore((state) => state.markCoverageMapped);
  return useMutation({
    mutationFn: (workspaceId: string) => appDataProvider.workspaces.mapSuites(workspaceId),
    onMutate: (workspaceId) => {
      setDrawerTab('output');
      markCoverageMapped(workspaceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => {
      pushNotice({
        tone: 'error',
        title: 'Coverage map failed',
        message: formatError(error),
      });
    },
  });
}

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => appDataProvider.projects.list(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useImportProject() {
  const queryClient = useQueryClient();
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const pushNotice = useAppStore((state) => state.pushNotice);
  return useMutation({
    mutationFn: (path: string) => appDataProvider.projects.import(activeWorkspaceId, path),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects', activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      pushNotice({
        tone: 'success',
        title: `Project imported: ${project.name}`,
        message: 'It is now available inside the active workspace.',
      });
    },
  });
}

export function useScanProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => appDataProvider.projects.scan(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });
}

export function useInitializeProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => appDataProvider.projects.initialize(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });
}

export function useScenarios(projectId?: string, enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['scenarios', activeWorkspaceId, projectId],
    queryFn: () => appDataProvider.scenarios.list(projectId),
    enabled: (!!activeWorkspaceId || !!projectId) && enabled,
  });
}

export function useRuns(filters?: {
  scenarioId?: string;
  state?: string;
  limit?: number;
}, enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['runs', activeWorkspaceId, filters],
    queryFn: () => appDataProvider.runs.list(filters),
    refetchInterval: enabled ? 1500 : false,
    enabled: !!activeWorkspaceId && enabled,
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['run', id],
    queryFn: () => appDataProvider.runs.get(id),
    enabled: !!id,
  });
}

export function useRunEvents(enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery<RunEventEnvelope[]>({
    queryKey: ['runs', activeWorkspaceId, 'events'],
    queryFn: () => appDataProvider.runs.events(),
    refetchInterval: 1500,
    enabled: !!activeWorkspaceId && enabled,
  });
}

export function useActiveRuns(enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['runs', activeWorkspaceId, 'active'],
    queryFn: () => appDataProvider.runs.getActive(),
    refetchInterval: 1000,
    enabled: !!activeWorkspaceId && enabled,
  });
}

export function useTraces(runId?: string) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['traces', activeWorkspaceId, runId],
    queryFn: () => appDataProvider.traces.list(runId),
    enabled: !!activeWorkspaceId,
  });
}

export function useTrace(id: string) {
  return useQuery({
    queryKey: ['trace', id],
    queryFn: () => appDataProvider.traces.get(id),
    enabled: !!id,
  });
}

export function useReplayTrace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (traceId: string) => appDataProvider.traces.replay(traceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traces'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useShrinkTrace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (traceId: string) => appDataProvider.traces.shrink(traceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traces'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useTrendReport(range: string) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['trends', activeWorkspaceId, range],
    queryFn: () => appDataProvider.trends.getReport(range),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  });
}

export function useTelemetrySnapshot() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['telemetry', activeWorkspaceId, 'snapshot'],
    queryFn: () => appDataProvider.telemetry.getSnapshot(),
    refetchInterval: 5000,
    enabled: !!activeWorkspaceId,
  });
}

export function useTelemetrySeries(metric: string, range: string) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['telemetry', activeWorkspaceId, 'series', metric, range],
    queryFn: () => appDataProvider.telemetry.getSeries(metric, range),
    enabled: !!activeWorkspaceId,
  });
}

export function useTelemetryHistory(limit: number) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['telemetry', activeWorkspaceId, 'history', limit],
    queryFn: () => appDataProvider.telemetry.getHistory(limit),
    enabled: !!activeWorkspaceId,
  });
}

export function useArtifacts(runId?: string) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['artifacts', activeWorkspaceId, runId],
    queryFn: () => appDataProvider.artifacts.list(runId),
    enabled: !!activeWorkspaceId,
  });
}

export function useFileTree(rootPath: string) {
  return useQuery({
    queryKey: ['fileTree', rootPath],
    queryFn: () => appDataProvider.fileSystem.getTree(rootPath),
    enabled: !!rootPath,
  });
}

export function useDocumentBundle(path: string, enabled = true) {
  return useQuery<LspDocumentBundle>({
    queryKey: ['documentBundle', path],
    queryFn: () => appDataProvider.fileSystem.getDocumentBundle(path),
    enabled: !!path && enabled,
    staleTime: 30_000,
  });
}

export function useDiagnostics(enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['diagnostics', activeWorkspaceId],
    queryFn: () => appDataProvider.fileSystem.getDiagnostics(),
    enabled: !!activeWorkspaceId && enabled,
  });
}

export function useActivity(limit = 15, enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['activity', activeWorkspaceId, limit],
    queryFn: () => appDataProvider.activity.getRecent(limit),
    enabled: !!activeWorkspaceId && enabled,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => appDataProvider.settings.get(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useTerminalSessions(enabled = true) {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return useQuery({
    queryKey: ['terminal', activeWorkspaceId, 'sessions'],
    queryFn: () => appDataProvider.terminal.list(),
    refetchInterval: 1000,
    enabled: !!activeWorkspaceId && enabled,
  });
}

export function useRunScenario() {
  const queryClient = useQueryClient();
  const pushNotice = useAppStore((state) => state.pushNotice);
  const setDrawerTab = useAppStore((state) => state.setDrawerTab);
  return useMutation({
    mutationFn: (scenarioId: string) => appDataProvider.scenarios.run(scenarioId),
    onMutate: (scenarioId) => {
      setDrawerTab('output');
      void logFrontendEvent('info', 'frontend.scenario', 'scenario run started', { scenarioId });
      pushNotice({
        tone: 'info',
        title: 'Scenario run started',
        message: scenarioId.split('::').pop() ?? scenarioId,
      });
    },
    onSuccess: (run) => {
      const failed = run.state === 'failed' || run.state === 'cancelled' || (run.exitCode ?? 0) !== 0;
      void logFrontendEvent(
        failed ? 'error' : 'info',
        'frontend.scenario',
        failed ? 'scenario run failed' : 'scenario run finished',
        { runId: run.id, state: run.state, exitCode: run.exitCode },
      );
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['traces'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      if (failed) {
        pushNotice({
          tone: 'error',
          title: 'Scenario run failed',
          message: describeRunOutcome(run),
        });
        return;
      }
      pushNotice({
        tone: 'success',
        title: 'Scenario run finished',
        message: 'Results and output are available in the drawer.',
      });
    },
    onError: (error) => {
      const message = formatError(error);
      void logFrontendEvent('error', 'frontend.scenario', 'scenario run failed', {
        message,
      });
      pushNotice({
        tone: 'error',
        title: 'Scenario run failed',
        message,
      });
    },
  });
}

export function useRunAllScenarios() {
  const queryClient = useQueryClient();
  const pushNotice = useAppStore((state) => state.pushNotice);
  const setDrawerTab = useAppStore((state) => state.setDrawerTab);
  return useMutation({
    mutationFn: (projectId: string) => appDataProvider.scenarios.runAll(projectId),
    onMutate: () => {
      setDrawerTab('output');
      void logFrontendEvent('info', 'frontend.scenario', 'run all started');
      pushNotice({
        tone: 'info',
        title: 'Run all started',
        message: 'Fozzy is executing the workspace suite now.',
      });
    },
    onSuccess: (runs) => {
      const failedRuns = runs.filter(
        (run) => run.state === 'failed' || run.state === 'cancelled' || (run.exitCode ?? 0) !== 0,
      );
      const failed = failedRuns.length > 0;
      void logFrontendEvent(
        failed ? 'error' : 'info',
        'frontend.scenario',
        failed ? 'run all failed' : 'run all finished',
        {
          runCount: runs.length,
          failedRunCount: failedRuns.length,
          failedRuns: failedRuns.map((run) => ({
            id: run.id,
            state: run.state,
            exitCode: run.exitCode,
            scenarioName: run.scenarioName,
          })),
        },
      );
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['traces'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      if (failed) {
        const firstFailure = failedRuns[0];
        pushNotice({
          tone: 'error',
          title: 'Run all failed',
          message:
            failedRuns.length === 1
              ? describeRunOutcome(firstFailure)
              : `${failedRuns.length} runs failed. First failure: ${describeRunOutcome(firstFailure)}`,
        });
        return;
      }
      pushNotice({
        tone: 'success',
        title: 'Run all finished',
        message: 'Suite output and results are ready.',
      });
    },
    onError: (error) => {
      const message = formatError(error);
      void logFrontendEvent('error', 'frontend.scenario', 'run all failed', {
        message,
      });
      pushNotice({
        tone: 'error',
        title: 'Run all failed',
        message,
      });
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => appDataProvider.runs.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<Settings>) => appDataProvider.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useRunTerminalCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: string) => appDataProvider.terminal.run(command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal'] });
    },
  });
}

export function useExecuteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: { mode?: string; includeHostVariants?: boolean }) =>
      appDataProvider.workflows.execute(params?.mode, params?.includeHostVariants),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['traces'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      queryClient.invalidateQueries({ queryKey: ['trends'] });
    },
  });
}
