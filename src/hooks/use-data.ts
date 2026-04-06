import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockDataProvider } from '@/data/mocks';
import type { Settings } from '@/types';

// ── Queries ───────────────────────────────────────────────────────────────────

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => mockDataProvider.workspaces.list(),
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => mockDataProvider.workspaces.get(id),
    enabled: !!id,
  });
}

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => mockDataProvider.projects.list(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useScenarios(projectId?: string) {
  return useQuery({
    queryKey: ['scenarios', projectId],
    queryFn: () => mockDataProvider.scenarios.list(projectId),
  });
}

export function useRuns(filters?: {
  scenarioId?: string;
  state?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['runs', filters],
    queryFn: () => mockDataProvider.runs.list(filters),
  });
}

export function useActiveRuns() {
  return useQuery({
    queryKey: ['runs', 'active'],
    queryFn: () => mockDataProvider.runs.getActive(),
    refetchInterval: 3000,
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['run', id],
    queryFn: () => mockDataProvider.runs.get(id),
    enabled: !!id,
  });
}

export function useTraces(runId?: string) {
  return useQuery({
    queryKey: ['traces', runId],
    queryFn: () => mockDataProvider.traces.list(runId),
  });
}

export function useTrace(id: string) {
  return useQuery({
    queryKey: ['trace', id],
    queryFn: () => mockDataProvider.traces.get(id),
    enabled: !!id,
  });
}

export function useReplayTrace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (traceId: string) => mockDataProvider.traces.replay(traceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traces'] });
    },
  });
}

export function useShrinkTrace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (traceId: string) => mockDataProvider.traces.shrink(traceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traces'] });
    },
  });
}

export function useTelemetrySnapshot() {
  return useQuery({
    queryKey: ['telemetry', 'snapshot'],
    queryFn: () => mockDataProvider.telemetry.getSnapshot(),
    refetchInterval: 5000,
  });
}

export function useTelemetrySeries(metric: string, range: string) {
  return useQuery({
    queryKey: ['telemetry', 'series', metric, range],
    queryFn: () => mockDataProvider.telemetry.getSeries(metric, range),
  });
}

export function useTelemetryHistory(limit: number) {
  return useQuery({
    queryKey: ['telemetry', 'history', limit],
    queryFn: () => mockDataProvider.telemetry.getHistory(limit),
  });
}

export function useArtifacts(runId?: string) {
  return useQuery({
    queryKey: ['artifacts', runId],
    queryFn: () => mockDataProvider.artifacts.list(runId),
  });
}

export function useFileTree(rootPath: string) {
  return useQuery({
    queryKey: ['fileTree', rootPath],
    queryFn: () => mockDataProvider.fileSystem.getTree(rootPath),
  });
}

export function useDiagnostics() {
  return useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => mockDataProvider.fileSystem.getDiagnostics(),
  });
}

export function useActivity(limit = 15) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: () => mockDataProvider.activity.getRecent(limit),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => mockDataProvider.settings.get(),
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRunScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenarioId: string) =>
      mockDataProvider.scenarios.run(scenarioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => mockDataProvider.runs.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<Settings>) =>
      mockDataProvider.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
