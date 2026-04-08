import { invoke } from '@tauri-apps/api/core';
import { logInfo, timed } from '@/lib/debug-log';
import { normalizeError } from '@/lib/errors';
import { queryClient } from '@/lib/query-client';
import { useAppStore } from '@/stores/app-store';
import type {
  AppBootstrap,
  ActivityItem,
  Artifact,
  ArtifactSummary,
  Diagnostic,
  FileNode,
  LspDocumentBundle,
  RunListItem,
  Run,
  RunSummary,
  Scenario,
  Settings,
  TerminalSession,
  Trace,
  Workspace,
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from '@/types';
import type { TrendReport, WorkspaceWorkflowResult } from '@/types/backend-contracts';
import type {
  ActivityRepository,
  ArtifactRepository,
  FileSystemRepository,
  ProjectRepository,
  RunRepository,
  ScenarioRepository,
  SettingsRepository,
  TelemetryRepository,
  TraceRepository,
  WorkspaceRepository,
} from '@/data/repositories';
import type { Project } from '@/types';

type FozzyBackend = 'scripted' | 'host' | 'virtual';

interface FozzyCommandRequest {
  workspaceId: string;
  requestId?: string;
  command: unknown;
}

interface DocumentApiResponse {
  workspaceId: string;
  path: string;
  languageId: string;
  text: string;
  sha256: string;
}

interface BackendTelemetrySnapshot {
  workspaceId: string;
  recordedAt: string;
  passRate: number;
  failRate: number;
  totalRuns: number;
  avgLatencyMs: number;
  flakeSignals: number;
  memoryUsageMb: number;
  exploreProgress: number;
  fuzzProgress: number;
  throughputPerHour: number;
  traceRecordRate: number;
  artifactCount: number;
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { timeoutMs?: number },
): Promise<T> {
  return timed(`invoke:${command}`, async () => {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    return await new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs > 0
        ? window.setTimeout(() => {
            reject(new Error(`Backend command timed out after ${timeoutMs}ms: ${command}`));
          }, timeoutMs)
        : null;
      void invoke<T>(command, args)
        .then((result) => {
          if (timeout !== null) window.clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          if (timeout !== null) window.clearTimeout(timeout);
          reject(normalizeError(error, `Backend command failed: ${command}`));
        });
    });
  });
}

function activeWorkspaceId(): string {
  return useAppStore.getState().activeWorkspaceId;
}

function cachedWorkspaceSummary(workspaceId: string): WorkspaceSummary | null {
  const workspaces = queryClient.getQueryData<WorkspaceSummary[]>(['bootstrapWorkspaces']);
  return workspaces?.find((workspace) => workspace.id === workspaceId) ?? null;
}

async function ensureActiveWorkspaceId(): Promise<string> {
  const current = activeWorkspaceId();
  if (current) return current;
  throw new Error('No active workspace selected');
}

async function maybeWorkspaceId(): Promise<string | null> {
  try {
    return await ensureActiveWorkspaceId();
  } catch {
    return null;
  }
}

function encodeScenarioId(workspaceId: string, path: string): string {
  return `${workspaceId}::${path}`;
}

function decodeScenarioId(id: string): { workspaceId: string; path: string } {
  const [workspaceId, ...rest] = id.split('::');
  return { workspaceId, path: rest.join('::') };
}

function encodeTraceId(workspaceId: string, path: string): string {
  return `${workspaceId}::${path}`;
}

function decodeTraceId(id: string): { workspaceId: string; path: string } {
  const [workspaceId, ...rest] = id.split('::');
  return { workspaceId, path: rest.join('::') };
}

function workspaceStatus(summary: WorkspaceSummary): Workspace['status'] {
  if (summary.session.isIndexing) return 'initializing';
  if (summary.readinessGaps.some((gap) => gap.severity === 'error')) return 'error';
  if (summary.readinessGaps.some((gap) => gap.severity === 'warning')) return 'warning';
  return 'healthy';
}

export function mapWorkspaceSummary(summary: WorkspaceSummary, stats?: { passing: number; failing: number }): Workspace {
  const passing = stats?.passing ?? 0;
  const failing = stats?.failing ?? 0;
  const total = summary.scenarioCount;
  return {
    id: summary.id,
    name: summary.name,
    path: summary.rootPath,
    parentPath: summary.parentPath,
    lastOpened: summary.lastOpenedAt,
    starred: false,
    status: workspaceStatus(summary),
    testCount: total,
    passingCount: passing,
    failingCount: failing,
    coveragePercent: total > 0 ? Math.round((passing / total) * 100) : 0,
  };
}

function projectIdForWorkspace(workspaceId: string): string {
  return `project:${workspaceId}`;
}

function inferLanguage(summary: { configPath: string | null; rootPath: string }): Project['language'] {
  const configPath = summary.configPath ?? '';
  if (configPath.endsWith('.py') || summary.rootPath.includes('python')) return 'python';
  if (configPath.endsWith('.go') || summary.rootPath.includes('go')) return 'go';
  if (summary.rootPath.includes('cpp') || configPath.includes('CMake')) return 'cpp';
  if (summary.rootPath.includes('/c') || configPath.endsWith('.c')) return 'c';
  if (summary.rootPath.includes('rs') || configPath.includes('Cargo')) return 'rust';
  return 'typescript';
}

type CanonicalRunStatus = 'running' | 'cancelled' | 'pass' | 'fail' | 'error' | 'timeout' | 'crash';

function mapProject(summary: WorkspaceProjectSummary): Project {
  return {
    id: summary.id,
    workspaceId: summary.workspaceId,
    name: summary.name,
    path: summary.rootPath,
    language: inferLanguage(summary),
    scanState: 'complete',
    configStatus: summary.configPath ? 'configured' : 'unconfigured',
    scenarioCount: summary.scenarioCount,
    lastScanned: summary.lastOpenedAt,
  };
}

function scenarioTypeFromPath(path: string): Scenario['type'] {
  if (path.includes('fuzz')) return 'fuzz';
  if (path.includes('explore')) return 'explore';
  if (path.includes('memory')) return 'memory';
  if (path.includes('host')) return 'host';
  if (path.includes('generated')) return 'generated';
  if (path.includes('test')) return 'test';
  return 'run';
}

function runState(summary: RunSummary | RunListItem): Run['state'] {
  switch (canonicalRunStatus(summary)) {
    case 'running':
      return 'running';
    case 'cancelled':
      return 'cancelled';
    case 'pass':
      return 'passed';
    case 'timeout':
      return 'timeout';
    case 'fail':
    case 'error':
    case 'crash':
      return 'failed';
  }
}

function canonicalRunStatus(summary: Pick<RunSummary, 'status' | 'exitCode'> & Partial<Pick<RunSummary, 'stdoutJson'>>): CanonicalRunStatus {
  const fromJson = 'stdoutJson' in summary ? extractRunStatus(summary.stdoutJson) : null;
  if (fromJson) return fromJson;
  const normalized = normalizeStatus(summary.status);
  if (normalized) return normalized;
  return exitCodeToStatus(summary.exitCode);
}

function extractRunStatus(value: unknown): CanonicalRunStatus | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const direct = normalizeStatus(record.status);
  if (direct) return direct;
  const summary = extractRunStatus(record.summary);
  if (summary) return summary;
  const result = extractRunStatus(record.result);
  if (result) return result;
  return null;
}

function normalizeStatus(status: unknown): CanonicalRunStatus | null {
  if (typeof status !== 'string') return null;
  switch (status.trim().toLowerCase()) {
    case 'running':
      return 'running';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'pass':
    case 'passed':
    case 'success':
    case 'succeeded':
      return 'pass';
    case 'fail':
    case 'failed':
      return 'fail';
    case 'error':
      return 'error';
    case 'timeout':
    case 'timedout':
    case 'timed_out':
      return 'timeout';
    case 'crash':
    case 'crashed':
      return 'crash';
    default:
      return null;
  }
}

function exitCodeToStatus(exitCode: number | null | undefined): CanonicalRunStatus {
  switch (exitCode) {
    case 0:
      return 'pass';
    case 1:
      return 'fail';
    case 2:
      return 'error';
    case 3:
      return 'timeout';
    case 4:
      return 'crash';
    case null:
    case undefined:
      return 'running';
    default:
      return 'error';
  }
}

function isPassingRun(summary: Pick<RunSummary, 'status' | 'exitCode'> & Partial<Pick<RunSummary, 'stdoutJson'>>): boolean {
  return canonicalRunStatus(summary) === 'pass';
}

function isFinishedFailure(summary: Pick<RunSummary, 'status' | 'exitCode'> & Partial<Pick<RunSummary, 'stdoutJson'>>): boolean {
  return !['running', 'pass'].includes(canonicalRunStatus(summary));
}

function scenarioPathFromRun(run: RunSummary | RunListItem): string | null {
  return run.args[run.args.length - 1] ?? null;
}

function mapRun(summary: RunSummary | RunListItem, workspace: WorkspaceSummary): Run {
  const scenarioPath = scenarioPathFromRun(summary) ?? 'unknown';
  const stdout = 'stdoutText' in summary
    ? summary.stdoutText || (summary.stdoutJson ? JSON.stringify(summary.stdoutJson, null, 2) : '')
    : summary.stdoutPreview;
  return {
    id: summary.id,
    scenarioId: encodeScenarioId(workspace.id, scenarioPath),
    scenarioName: scenarioPath.split('/').pop() ?? summary.command,
    projectName: workspace.name,
    state: runState(summary),
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    duration:
      summary.finishedAt && summary.startedAt
        ? new Date(summary.finishedAt).getTime() - new Date(summary.startedAt).getTime()
        : null,
    stdout,
    stderr: 'stderrText' in summary ? summary.stderrText : summary.stderrPreview,
    exitCode: summary.exitCode,
    artifacts: artifactPathsFromRun(summary),
    traceId: summary.tracePath ? encodeTraceId(workspace.id, summary.tracePath) : null,
  };
}

function artifactPathsFromRun(run: RunSummary | RunListItem): string[] {
  const paths = new Set<string>();
  if (run.tracePath) paths.add(run.tracePath);
  if (!('stdoutJson' in run)) {
    return [...paths];
  }
  const identity = (run.stdoutJson as { identity?: { reportPath?: string; artifactsDir?: string } } | null)?.identity;
  if (identity?.reportPath) paths.add(identity.reportPath);
  if (identity?.artifactsDir) paths.add(identity.artifactsDir);
  return [...paths];
}

async function listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  return call<WorkspaceSummary[]>('list_workspaces');
}

async function getWorkspaceSummary(id: string): Promise<WorkspaceSummary> {
  return call<WorkspaceSummary>('get_workspace', {
    lookup: { workspaceId: id },
  });
}

async function listProjectSummaries(workspaceId: string): Promise<WorkspaceProjectSummary[]> {
  return call<WorkspaceProjectSummary[]>('list_projects', {
    lookup: { workspaceId },
  });
}

async function getProjectSummary(projectId: string): Promise<WorkspaceProjectSummary> {
  return call<WorkspaceProjectSummary>('get_project', {
    lookup: { projectId },
  });
}

async function listRunItems(
  workspaceId: string,
  options?: { limit?: number; activeOnly?: boolean },
): Promise<RunListItem[]> {
  return call<RunListItem[]>('list_runs_filtered', {
    lookup: { workspaceId },
    limit: options?.limit,
    activeOnly: options?.activeOnly ?? false,
  });
}

async function getRunSummary(runId: string): Promise<RunSummary> {
  return call<RunSummary>('get_run', { runId });
}

async function getScenarioInventory(workspaceId: string): Promise<{
  workspaceId: string;
  scenarios: Array<{
    path: string;
    kind: string;
    title: string;
    lastModifiedAt: string | null;
  }>;
  countsByKind: Record<string, number>;
}> {
  return call('get_scenario_inventory', {
    lookup: { workspaceId },
  });
}

async function getProjectScenarioInventory(projectId: string): Promise<{
  workspaceId: string;
  scenarios: Array<{
    path: string;
    kind: string;
    title: string;
    lastModifiedAt: string | null;
  }>;
  countsByKind: Record<string, number>;
}> {
  return call('get_project_scenario_inventory', {
    lookup: { projectId },
  }, {
    timeoutMs: 60_000,
  });
}

async function getScenarioStatusMap(workspaceId: string): Promise<Map<string, RunListItem>> {
  const runs = await listRunItems(workspaceId);
  const latest = new Map<string, RunListItem>();
  for (const run of runs) {
    const scenarioPath = scenarioPathFromRun(run);
    if (scenarioPath && !latest.has(scenarioPath)) {
      latest.set(scenarioPath, run);
    }
  }
  return latest;
}

async function mapScenarioInventory(workspaceId: string): Promise<Scenario[]> {
  const inventory = await getScenarioInventory(workspaceId);
  const latestRunByPath = await getScenarioStatusMap(workspaceId);
  return inventory.scenarios.map((scenario) => {
    const latest = latestRunByPath.get(scenario.path);
    let status: Scenario['status'] = 'unknown';
    if (latest) {
      status = isPassingRun(latest) ? 'passing' : isFinishedFailure(latest) ? 'failing' : 'unknown';
    }
    return {
      id: encodeScenarioId(workspaceId, scenario.path),
      projectId: projectIdForWorkspace(workspaceId),
      name: scenario.title,
      type: scenarioTypeFromPath(scenario.path),
      status,
      filePath: scenario.path,
      line: 1,
      lastRun: latest?.finishedAt ?? latest?.startedAt ?? scenario.lastModifiedAt,
      duration:
        latest?.finishedAt && latest.startedAt
          ? new Date(latest.finishedAt).getTime() - new Date(latest.startedAt).getTime()
          : null,
      tags: scenario.path.includes('generated') ? ['generated'] : [],
    };
  });
}

async function mapProjectScenarioInventory(projectId: string): Promise<Scenario[]> {
  const project = await getProjectSummary(projectId);
  const inventory = await getProjectScenarioInventory(projectId);
  const latestRunByPath = await getScenarioStatusMap(project.workspaceId);
  return inventory.scenarios.map((scenario) => {
    const latest = latestRunByPath.get(scenario.path);
    let status: Scenario['status'] = 'unknown';
    if (latest) {
      status = isPassingRun(latest) ? 'passing' : isFinishedFailure(latest) ? 'failing' : 'unknown';
    }
    return {
      id: encodeScenarioId(project.workspaceId, scenario.path),
      projectId: project.id,
      name: scenario.title,
      type: scenarioTypeFromPath(scenario.path),
      status,
      filePath: scenario.path,
      line: 1,
      lastRun: latest?.finishedAt ?? latest?.startedAt ?? scenario.lastModifiedAt,
      duration:
        latest?.finishedAt && latest.startedAt
          ? new Date(latest.finishedAt).getTime() - new Date(latest.startedAt).getTime()
          : null,
      tags: scenario.path.includes('generated') ? ['generated'] : [],
    };
  });
}

async function executeFozzyCommand(command: unknown, workspaceId: string) {
  return call<RunSummary>('execute_fozzy_command', {
    request: {
      workspaceId,
      command,
    } satisfies FozzyCommandRequest,
  }, {
    timeoutMs: 0,
  });
}

async function runMapSuites(workspaceId: string): Promise<Run> {
  const workspace = await getWorkspaceSummary(workspaceId);
  const run = await executeFozzyCommand(
    {
      map: {
        subcommand: 'suites',
        root: '.',
        scenarioRoot: 'tests',
        profile: 'pedantic',
        common: { json: true, strict: true, cwd: workspace.rootPath },
      },
    },
    workspaceId,
  );
  return mapRun(run, workspace);
}

async function readDocument(path: string): Promise<DocumentApiResponse> {
  const workspaceId = await ensureActiveWorkspaceId();
  return call<DocumentApiResponse>('read_document', {
    query: { workspaceId, path },
  });
}

async function getDocumentBundle(path: string): Promise<LspDocumentBundle> {
  const workspaceId = await ensureActiveWorkspaceId();
  return call<LspDocumentBundle>('get_document_bundle', {
    query: { workspaceId, path },
  });
}

async function getFileTree(): Promise<FileNode> {
  const workspaceId = await ensureActiveWorkspaceId();
  const node = await call<{
    name: string;
    path: string;
    nodeType: string;
    children?: FileNode[];
    language?: string | null;
    truncated?: boolean;
  }>('get_file_tree', {
    query: {
      workspaceId,
      maxDepth: 4,
      maxEntries: 2_000,
      includeHidden: false,
    },
  });
  return mapFileNode(node);
}

function mapFileNode(node: {
  name: string;
  path: string;
  nodeType: string;
  children?: unknown[];
  language?: string | null;
  truncated?: boolean;
}): FileNode {
  return {
    name: node.name,
    path: node.path,
    type: node.nodeType === 'directory' ? 'directory' : 'file',
    language: node.language ?? undefined,
    truncated: node.truncated ?? false,
    children: Array.isArray(node.children)
      ? (node.children as Array<{
          name: string;
          path: string;
          nodeType: string;
          children?: unknown[];
          language?: string | null;
        }>).map(mapFileNode)
      : undefined,
  };
}

async function workspaceDiagnostics(): Promise<Diagnostic[]> {
  const workspaceId = await ensureActiveWorkspaceId();
  const diagnostics = await call<Array<{
    severity: string;
    message: string;
    path: string;
    line: number | null;
    column: number | null;
    source: string;
    code: string | null;
  }>>('get_workspace_diagnostics', {
    lookup: { workspaceId },
  });
  return diagnostics.map((diagnostic, index) => ({
    id: `${diagnostic.path}:${diagnostic.line ?? 0}:${index}`,
    filePath: diagnostic.path,
    line: diagnostic.line ?? 1,
    column: diagnostic.column ?? 1,
    severity: (diagnostic.severity as Diagnostic['severity']) ?? 'info',
    message: diagnostic.message,
    source: diagnostic.source,
  }));
}

function mapActivity(items: Array<{ id: string; itemType: string; message: string; timestamp: string; link?: string | null }>): ActivityItem[] {
  return items.map((item) => ({
    id: item.id,
    type: (item.itemType as ActivityItem['type']) ?? 'warning',
    message: item.message,
    timestamp: item.timestamp,
    link: item.link ?? undefined,
  }));
}

async function readArtifactContent(path: string): Promise<string> {
  try {
    const document = await readDocument(path);
    return document.text;
  } catch {
    return '';
  }
}

async function listArtifactsForWorkspace(runId?: string): Promise<Artifact[]> {
  const workspaceId = await ensureActiveWorkspaceId();
  const workspace = await getWorkspaceSummary(workspaceId);
  const runs = runId
    ? await Promise.all([getRunSummary(runId)])
    : await Promise.all((await listRunItems(workspaceId)).map((run) => getRunSummary(run.id)));
  const targetRuns = runId ? runs.filter((run) => run.id === runId) : runs;
  const artifacts: Artifact[] = [];

  await Promise.all(
    targetRuns.map(async (run) => {
    const identity = (run.stdoutJson as { identity?: { reportPath?: string } } | null)?.identity;
    const derived: Array<{ path: string; type: Artifact['type'] }> = [];
    if (identity?.reportPath) derived.push({ path: identity.reportPath, type: 'report' });
    if (run.tracePath) derived.push({ path: run.tracePath, type: 'trace' });

    await Promise.all(derived.map(async (artifact) => {
      const content = await readArtifactContent(artifact.path);
      artifacts.push({
        id: `${run.id}:${artifact.path}`,
        runId: run.id,
        name: artifact.path.split('/').pop() ?? artifact.path,
        type: artifact.type,
        path: artifact.path,
        size: content.length,
        createdAt: run.finishedAt ?? run.startedAt,
      });
    }));
  }));

  if (!runId) {
    const workspaceArtifacts = await call<ArtifactSummary[]>('list_artifacts', {
      lookup: { workspaceId: workspace.id },
    });
    for (const artifact of workspaceArtifacts) {
      if (artifacts.some((item) => item.path === artifact.path)) continue;
      artifacts.push({
        id: `${workspace.id}:${artifact.path}`,
        runId: '',
        name: artifact.path.split('/').pop() ?? artifact.path,
        type: artifact.kind === 'trace' ? 'trace' : 'report',
        path: artifact.path,
        size: artifact.sizeBytes,
        createdAt: artifact.modifiedAt ?? workspace.lastOpenedAt,
      });
    }
  }

  return artifacts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function downloadArtifactById(id: string): Promise<void> {
  const artifacts = await listArtifactsForWorkspace();
  const artifact = artifacts.find((item) => item.id === id);
  if (!artifact) {
    throw new Error(`Artifact not found: ${id}`);
  }
  const content = await readArtifactContent(artifact.path);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function listTracesForWorkspace(runId?: string): Promise<Trace[]> {
  const workspaceId = await ensureActiveWorkspaceId();
  const [workspace, runs, artifactSummaries] = await Promise.all([
    getWorkspaceSummary(workspaceId),
    listRunItems(workspaceId),
    call<ArtifactSummary[]>('list_artifacts', {
      lookup: { workspaceId },
    }),
  ]);
  const tracePaths = new Set<string>(
    artifactSummaries
      .filter((artifact) => artifact.kind === 'trace' || artifact.path.includes('trace'))
      .map((artifact) => artifact.path),
  );
  runs.forEach((run) => {
    if (run.tracePath) tracePaths.add(run.tracePath);
  });

  const traces = [...tracePaths].map((path) => {
    const matchingRun = runs.find((run) => run.tracePath === path);
    return {
      id: encodeTraceId(workspaceId, path),
      runId: matchingRun?.id ?? '',
      scenarioName:
        matchingRun?.args[matchingRun.args.length - 1]?.split('/').pop() ??
        path.split('/').pop() ??
        'trace',
      phase: path.includes('shrink') ? 'shrink' : path.includes('replay') ? 'replay' : 'verify',
      status: 'complete',
      startedAt: matchingRun?.startedAt ?? workspace.lastOpenedAt,
      finishedAt: matchingRun?.finishedAt ?? workspace.lastOpenedAt,
      inputSize: 0,
      shrunkSize: null,
      steps: [],
    } satisfies Trace;
  });

  return runId ? traces.filter((trace) => trace.runId === runId) : traces;
}

async function getTraceById(id: string): Promise<Trace> {
  const { path } = decodeTraceId(id);
  const traces = await listTracesForWorkspace();
  const trace = traces.find((item) => item.id === id);
  if (!trace) {
    return {
      id,
      runId: '',
      scenarioName: path.split('/').pop() ?? path,
      phase: 'verify',
      status: 'complete',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      inputSize: 0,
      shrunkSize: null,
      steps: [],
    };
  }
  return trace;
}

async function runScenarioById(id: string): Promise<Run> {
  const { workspaceId, path } = decodeScenarioId(id);
  const run = await executeFozzyCommand(
    {
      run: {
        scenario: path,
        common: { json: true, strict: true },
        det: true,
        record: `artifacts/${path.split('/').pop()?.replace('.json', '') ?? 'scenario'}.trace.fozzy`,
      },
    },
    workspaceId,
  );
  const workspace = await getWorkspaceSummary(workspaceId);
  return mapRun(run, workspace);
}

async function runAllForWorkspace(projectId: string): Promise<Run[]> {
  const project = await getProjectSummary(projectId);
  const inventory = await getProjectScenarioInventory(projectId);
  if (inventory.scenarios.length === 0) {
    return [];
  }
  const run = await executeFozzyCommand(
    {
      test: {
        scenarios: inventory.scenarios.map((scenario) => scenario.path),
        common: { json: true, strict: true, cwd: project.rootPath },
        det: true,
      },
    },
    project.workspaceId,
  );
  const workspace = await getWorkspaceSummary(project.workspaceId);
  return [mapRun(run, workspace)];
}

function backendOptionsWithHost(): { procBackend: FozzyBackend; fsBackend: FozzyBackend; httpBackend: FozzyBackend } {
  return {
    procBackend: 'host',
    fsBackend: 'host',
    httpBackend: 'host',
  };
}

const workspaceRepo: WorkspaceRepository = {
  async list() {
    const summaries = await listWorkspaceSummaries();
    return summaries.map((summary) => mapWorkspaceSummary(summary));
  },
  async get(id: string) {
    const cached = cachedWorkspaceSummary(id);
    if (cached) return mapWorkspaceSummary(cached);
    const summary = await getWorkspaceSummary(id);
    return mapWorkspaceSummary(summary);
  },
  async getRecent() {
    const workspaces = await this.list();
    return [...workspaces]
      .sort((left, right) => right.lastOpened.localeCompare(left.lastOpened))
      .slice(0, 5);
  },
  async import(path: string) {
    logInfo('Importing workspace', { path });
    const summary = await call<WorkspaceSummary>('import_workspace', {
      request: { path, trusted: true },
    });
    useAppStore.getState().setActiveWorkspaceId(summary.id);
    return mapWorkspaceSummary(summary);
  },
  async mapSuites(id: string) {
    return runMapSuites(id);
  },
};

const projectRepo: ProjectRepository = {
  async list(workspaceId: string) {
    const summaries = await listProjectSummaries(workspaceId);
    return summaries.map((summary) => mapProject(summary));
  },
  async get(id: string) {
    const summary = await getProjectSummary(id);
    return mapProject(summary);
  },
  async import(workspaceId: string, path: string) {
    const summary = await call<WorkspaceProjectSummary>('import_project', {
      request: { workspaceId, path, trusted: true },
    });
    return mapProject(summary);
  },
  async scan(id: string) {
    await call<WorkspaceProjectSummary>('scan_project', {
      lookup: { projectId: id },
    });
  },
  async initialize(id: string) {
    const project = await getProjectSummary(id);
    await executeFozzyCommand(
      {
        init: {
          common: {
            json: true,
            strict: true,
            cwd: project.rootPath,
          },
        },
      },
      project.workspaceId,
    );
  },
};

const scenarioRepo: ScenarioRepository = {
  async list(projectId?: string) {
    if (projectId) return mapProjectScenarioInventory(projectId);
    const workspaceId = await ensureActiveWorkspaceId();
    return mapScenarioInventory(workspaceId);
  },
  async get(id: string) {
    const { workspaceId } = decodeScenarioId(id);
    const scenarios = await mapScenarioInventory(workspaceId);
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) throw new Error(`Scenario not found: ${id}`);
    return scenario;
  },
  async run(id: string) {
    return runScenarioById(id);
  },
  async runAll(projectId: string) {
    return runAllForWorkspace(projectId);
  },
};

const runRepo: RunRepository = {
  async list(filters) {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) return [];
    const [workspace, runs] = await Promise.all([
      getWorkspaceSummary(workspaceId),
      listRunItems(workspaceId, { limit: filters?.limit }),
    ]);
    let mapped = runs.map((run) => mapRun(run, workspace));
    if (filters?.scenarioId) mapped = mapped.filter((run) => run.scenarioId === filters.scenarioId);
    if (filters?.state) mapped = mapped.filter((run) => run.state === filters.state);
    return mapped;
  },
  async get(id: string) {
    const workspaceId = await ensureActiveWorkspaceId();
    const [workspace, run] = await Promise.all([
      getWorkspaceSummary(workspaceId),
      getRunSummary(id),
    ]);
    return mapRun(run, workspace);
  },
  async events() {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) return [];
    return call('get_run_events', {
      lookup: { workspaceId },
    });
  },
  async cancel(_id: string) {
    await call<RunSummary>('cancel_run', { runId: _id });
  },
  async getActive() {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) return [];
    const [workspace, runs] = await Promise.all([
      getWorkspaceSummary(workspaceId),
      listRunItems(workspaceId, { activeOnly: true, limit: 20 }),
    ]);
    return runs.map((run) => mapRun(run, workspace));
  },
};

const traceRepo: TraceRepository = {
  async list(runId) {
    return listTracesForWorkspace(runId);
  },
  async get(id: string) {
    return getTraceById(id);
  },
  async replay(id: string) {
    const { workspaceId, path } = decodeTraceId(id);
    await executeFozzyCommand(
      {
        replay: {
          trace: path,
          common: { json: true, strict: true, ...backendOptionsWithHost() },
        },
      },
      workspaceId,
    );
  },
  async shrink(id: string) {
    const { workspaceId, path } = decodeTraceId(id);
    await executeFozzyCommand(
      {
        shrink: {
          trace: path,
          common: { json: true, strict: true },
        },
      },
      workspaceId,
    );
  },
};

const telemetryRepo: TelemetryRepository = {
  async getSnapshot() {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) {
      return {
        timestamp: new Date().toISOString(),
        passRate: 0,
        failRate: 0,
        totalRuns: 0,
        avgLatency: 0,
        flakeSignals: 0,
        memoryUsageMb: 0,
        exploreProgress: 0,
        fuzzProgress: 0,
      };
    }
    const snapshot = await call<BackendTelemetrySnapshot>('get_telemetry_snapshot', {
      lookup: { workspaceId },
    });
    return {
      timestamp: snapshot.recordedAt,
      passRate: snapshot.passRate,
      failRate: snapshot.failRate,
      totalRuns: snapshot.totalRuns,
      avgLatency: Math.round(snapshot.avgLatencyMs),
      flakeSignals: snapshot.flakeSignals,
      memoryUsageMb: snapshot.memoryUsageMb,
      exploreProgress: snapshot.exploreProgress,
      fuzzProgress: snapshot.fuzzProgress,
    };
  },
  async getSeries(metric: string, range: string) {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) return [];
    const series = await call<{ workspaceId: string; metric: string; points: Array<{ ts: string; value: number }> }>(
      'get_telemetry_series',
      {
        query: { workspaceId, metric, range },
      },
    );
    const color =
      metric === 'passRate'
        ? '#22c55e'
        : metric === 'latency'
          ? '#3b82f6'
          : metric === 'memory'
            ? '#8b5cf6'
            : '#06b6d4';
    return [
      {
        label: metric,
        data: series.points.map((point) => ({
          timestamp: point.ts,
          value: point.value,
        })),
        color,
      },
    ];
  },
  async getHistory(limit: number) {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) return [];
    const history = await call<BackendTelemetrySnapshot[]>('get_telemetry_history', {
      query: { workspaceId, limit },
    });
    return history.map((snapshot) => ({
      timestamp: snapshot.recordedAt,
      passRate: snapshot.passRate,
      failRate: snapshot.failRate,
      totalRuns: snapshot.totalRuns,
      avgLatency: Math.round(snapshot.avgLatencyMs),
      flakeSignals: snapshot.flakeSignals,
      memoryUsageMb: snapshot.memoryUsageMb,
      exploreProgress: snapshot.exploreProgress,
      fuzzProgress: snapshot.fuzzProgress,
    }));
  },
};

const artifactRepo: ArtifactRepository = {
  async list(runId) {
    return listArtifactsForWorkspace(runId);
  },
  async get(id: string) {
    const artifacts = await listArtifactsForWorkspace();
    const artifact = artifacts.find((item) => item.id === id);
    if (!artifact) throw new Error(`Artifact not found: ${id}`);
    return artifact;
  },
  async download(id: string) {
    await downloadArtifactById(id);
  },
};

const fileSystemRepo: FileSystemRepository = {
  async getTree(_rootPath: string) {
    return getFileTree();
  },
  async readFile(path: string) {
    const document = await readDocument(path);
    return document.text;
  },
  async getDocumentBundle(path: string) {
    return getDocumentBundle(path);
  },
  async writeFile(path: string, content: string) {
    const workspaceId = await ensureActiveWorkspaceId();
    await call<string>('write_workspace_file', {
      request: {
        workspaceId,
        relativePath: path,
        contents: content,
        mode: 'previewPatchThenApply',
        expectedSha256: null,
      },
    });
  },
  async getDiagnostics() {
    return workspaceDiagnostics();
  },
};

const activityRepo: ActivityRepository = {
  async getRecent(limit: number) {
    const workspaceId = await maybeWorkspaceId();
    if (!workspaceId) return [];
    const items = await call<Array<{ id: string; itemType: string; message: string; timestamp: string; link?: string | null }>>(
      'get_activity',
      {
        lookup: { workspaceId },
        limit,
      },
    );
    return mapActivity(items);
  },
  subscribe() {
    return () => {};
  },
};

const settingsRepo: SettingsRepository = {
  async get() {
    return call<Settings>('get_settings');
  },
  async update(settings: Partial<Settings>) {
    return call<Settings>('update_settings', {
      patch: {
        theme: settings.theme,
        fontSize: settings.fontSize,
        tabSize: settings.tabSize,
        autoSave: settings.autoSave,
        telemetryEnabled: settings.telemetryEnabled,
        checkpointInterval: settings.checkpointInterval,
        defaultRunner: settings.defaultRunner,
      },
    });
  },
};

export interface AppDataProvider {
  bootstrap: {
    load(): Promise<AppBootstrap>;
    setActiveWorkspace(workspaceId: string): Promise<void>;
  };
  workspaces: WorkspaceRepository;
  projects: ProjectRepository;
  scenarios: ScenarioRepository;
  runs: RunRepository;
  traces: TraceRepository;
  telemetry: TelemetryRepository;
  artifacts: ArtifactRepository;
  fileSystem: FileSystemRepository;
  activity: ActivityRepository;
  settings: SettingsRepository;
  trends: {
    getReport(range: string): Promise<TrendReport>;
  };
  workflows: {
    execute(mode?: string, includeHostVariants?: boolean): Promise<WorkspaceWorkflowResult>;
  };
  terminal: {
    list(): Promise<TerminalSession[]>;
    run(command: string): Promise<TerminalSession>;
  };
}

export const appDataProvider: AppDataProvider = {
  bootstrap: {
    async load() {
      return call<AppBootstrap>('app_bootstrap', undefined, {
        timeoutMs: 60_000,
      });
    },
    async setActiveWorkspace(workspaceId: string) {
      await call('set_active_workspace', {
        lookup: { workspaceId },
      }, {
        timeoutMs: 30_000,
      });
    },
  },
  workspaces: workspaceRepo,
  projects: projectRepo,
  scenarios: scenarioRepo,
  runs: runRepo,
  traces: traceRepo,
  telemetry: telemetryRepo,
  artifacts: artifactRepo,
  fileSystem: fileSystemRepo,
  activity: activityRepo,
  settings: settingsRepo,
  trends: {
    async getReport(range: string) {
      const workspaceId = await ensureActiveWorkspaceId();
      return call<TrendReport>('get_trend_report', {
        query: { workspaceId, range },
      });
    },
  },
  workflows: {
    async execute(mode = 'full', includeHostVariants = true) {
      const workspaceId = await ensureActiveWorkspaceId();
      return call<WorkspaceWorkflowResult>('execute_workspace_workflow', {
        request: { workspaceId, mode, includeHostVariants },
      });
    },
  },
  terminal: {
    async list() {
      const workspaceId = await maybeWorkspaceId();
      if (!workspaceId) return [];
      return call<TerminalSession[]>('list_terminal_sessions', {
        lookup: { workspaceId },
      });
    },
    async run(command: string) {
      const workspaceId = await ensureActiveWorkspaceId();
      return call<TerminalSession>('create_terminal_session', {
        request: { workspaceId, command },
      }, {
        timeoutMs: 0,
      });
    },
  },
};
