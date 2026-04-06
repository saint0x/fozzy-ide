import type {
  Workspace,
  Run,
  ActivityItem,
  Settings,
} from '@/types';

import type {
  WorkspaceRepository,
  ProjectRepository,
  ScenarioRepository,
  RunRepository,
  TraceRepository,
  TelemetryRepository,
  ArtifactRepository,
  FileSystemRepository,
  ActivityRepository,
  SettingsRepository,
} from '@/data/repositories';

import { mockWorkspaces } from './workspaces';
import { mockProjects } from './projects';
import { mockScenarios } from './scenarios';
import { mockRuns } from './runs';
import { mockTraces } from './traces';
import { mockCurrentSnapshot, mockTelemetrySnapshots, mockTelemetrySeries } from './telemetry';
import { mockArtifacts } from './artifacts';
import { mockFileTree, mockDiagnostics, mockFileContent } from './filesystem';
import { mockActivityItems } from './activity';
import { mockSettings } from './settings';

// ── Helpers ────────────────────────────────────────────────────────────────────

function delay<T>(value: T, ms = 60): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function notFound(entity: string, id: string): never {
  throw new Error(`${entity} not found: ${id}`);
}

// ── Mock Repositories ──────────────────────────────────────────────────────────

const workspaceRepo: WorkspaceRepository = {
  list: () => delay([...mockWorkspaces]),
  get: (id: string) => {
    const ws = mockWorkspaces.find((w) => w.id === id);
    return ws ? delay(ws) : Promise.reject(notFound('Workspace', id));
  },
  getRecent: () => delay([...mockWorkspaces].sort((a, b) => b.lastOpened.localeCompare(a.lastOpened)).slice(0, 5)),
  import: (path: string) => {
    const ws: Workspace = {
      id: `ws-${Date.now()}`,
      name: path.split('/').pop() ?? 'unnamed',
      path,
      parentPath: path.split('/').slice(0, -1).join('/'),
      lastOpened: new Date().toISOString(),
      starred: false,
      status: 'initializing',
      testCount: 0,
      passingCount: 0,
      failingCount: 0,
      coveragePercent: 0,
    };
    mockWorkspaces.push(ws);
    return delay(ws, 100);
  },
};

const projectRepo: ProjectRepository = {
  list: (workspaceId: string) => delay(mockProjects.filter((p) => p.workspaceId === workspaceId)),
  get: (id: string) => {
    const proj = mockProjects.find((p) => p.id === id);
    return proj ? delay(proj) : Promise.reject(notFound('Project', id));
  },
  scan: (id: string) => {
    const proj = mockProjects.find((p) => p.id === id);
    if (!proj) return Promise.reject(notFound('Project', id));
    proj.scanState = 'scanning';
    return delay(undefined, 100).then(() => {
      proj.scanState = 'complete';
      proj.lastScanned = new Date().toISOString();
    });
  },
  initialize: (id: string) => {
    const proj = mockProjects.find((p) => p.id === id);
    if (!proj) return Promise.reject(notFound('Project', id));
    proj.configStatus = 'configured';
    return delay(undefined, 100);
  },
};

const scenarioRepo: ScenarioRepository = {
  list: (projectId?: string) =>
    delay(projectId ? mockScenarios.filter((s) => s.projectId === projectId) : [...mockScenarios]),
  get: (id: string) => {
    const sc = mockScenarios.find((s) => s.id === id);
    return sc ? delay(sc) : Promise.reject(notFound('Scenario', id));
  },
  run: (id: string) => {
    const sc = mockScenarios.find((s) => s.id === id);
    if (!sc) return Promise.reject(notFound('Scenario', id));
    const run: Run = {
      id: `run-${Date.now()}`,
      scenarioId: id,
      scenarioName: sc.name,
      projectName: mockProjects.find((p) => p.id === sc.projectId)?.name ?? 'unknown',
      state: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      stdout: '',
      stderr: '',
      exitCode: null,
      artifacts: [],
      traceId: null,
    };
    mockRuns.unshift(run);
    return delay(run, 80);
  },
  runAll: (projectId: string) => {
    const scenarios = mockScenarios.filter((s) => s.projectId === projectId);
    const runs = scenarios.map((sc): Run => ({
      id: `run-${Date.now()}-${sc.id}`,
      scenarioId: sc.id,
      scenarioName: sc.name,
      projectName: mockProjects.find((p) => p.id === projectId)?.name ?? 'unknown',
      state: 'queued',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      stdout: '',
      stderr: '',
      exitCode: null,
      artifacts: [],
      traceId: null,
    }));
    mockRuns.unshift(...runs);
    return delay(runs, 100);
  },
};

const runRepo: RunRepository = {
  list: (filters?: { scenarioId?: string; state?: string; limit?: number }) => {
    let runs = [...mockRuns];
    if (filters?.scenarioId) runs = runs.filter((r) => r.scenarioId === filters.scenarioId);
    if (filters?.state) runs = runs.filter((r) => r.state === filters.state);
    if (filters?.limit) runs = runs.slice(0, filters.limit);
    return delay(runs);
  },
  get: (id: string) => {
    const run = mockRuns.find((r) => r.id === id);
    return run ? delay(run) : Promise.reject(notFound('Run', id));
  },
  cancel: (id: string) => {
    const run = mockRuns.find((r) => r.id === id);
    if (!run) return Promise.reject(notFound('Run', id));
    run.state = 'cancelled';
    run.finishedAt = new Date().toISOString();
    return delay(undefined, 50);
  },
  getActive: () => delay(mockRuns.filter((r) => r.state === 'running' || r.state === 'queued')),
};

const traceRepo: TraceRepository = {
  list: (runId?: string) => delay(runId ? mockTraces.filter((t) => t.runId === runId) : [...mockTraces]),
  get: (id: string) => {
    const trace = mockTraces.find((t) => t.id === id);
    return trace ? delay(trace) : Promise.reject(notFound('Trace', id));
  },
  replay: (id: string) => {
    const trace = mockTraces.find((t) => t.id === id);
    if (!trace) return Promise.reject(notFound('Trace', id));
    trace.status = 'running';
    return delay(undefined, 100).then(() => {
      trace.status = 'complete';
    });
  },
  shrink: (id: string) => {
    const trace = mockTraces.find((t) => t.id === id);
    if (!trace) return Promise.reject(notFound('Trace', id));
    trace.phase = 'shrink';
    trace.status = 'running';
    return delay(undefined, 100).then(() => {
      trace.status = 'complete';
      trace.shrunkSize = Math.floor((trace.inputSize ?? 0) / 8);
    });
  },
};

const telemetryRepo: TelemetryRepository = {
  getSnapshot: () => delay({ ...mockCurrentSnapshot }),
  getSeries: (metric: string, _range: string) => {
    const series = mockTelemetrySeries[metric];
    return series ? delay([...series]) : delay([]);
  },
  getHistory: (limit: number) => delay(mockTelemetrySnapshots.slice(-limit)),
};

const artifactRepo: ArtifactRepository = {
  list: (runId?: string) => delay(runId ? mockArtifacts.filter((a) => a.runId === runId) : [...mockArtifacts]),
  get: (id: string) => {
    const art = mockArtifacts.find((a) => a.id === id);
    return art ? delay(art) : Promise.reject(notFound('Artifact', id));
  },
  download: (_id: string) => delay(undefined, 100),
};

const fileSystemRepo: FileSystemRepository = {
  getTree: (_rootPath: string) => delay(structuredClone(mockFileTree)),
  readFile: (_path: string) => delay(mockFileContent, 80),
  writeFile: (_path: string, _content: string) => delay(undefined, 50),
  getDiagnostics: () => delay([...mockDiagnostics]),
};

const activityRepo: ActivityRepository = {
  getRecent: (limit: number) =>
    delay(
      [...mockActivityItems]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit),
    ),
  subscribe: (callback: (item: ActivityItem) => void) => {
    const interval = setInterval(() => {
      const item: ActivityItem = {
        id: `act-live-${Date.now()}`,
        type: 'run_passed',
        message: `Heartbeat check passed at ${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
      };
      callback(item);
    }, 10000);
    return () => clearInterval(interval);
  },
};

let currentSettings: Settings = { ...mockSettings };

const settingsRepo: SettingsRepository = {
  get: () => delay({ ...currentSettings }),
  update: (partial: Partial<Settings>) => {
    currentSettings = { ...currentSettings, ...partial };
    return delay({ ...currentSettings });
  },
};

// ── MockDataProvider ───────────────────────────────────────────────────────────

export interface MockDataProvider {
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
}

export const mockDataProvider: MockDataProvider = {
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
};

// Re-export raw mock data for direct access when needed
export { mockWorkspaces } from './workspaces';
export { mockProjects } from './projects';
export { mockScenarios } from './scenarios';
export { mockRuns } from './runs';
export { mockTraces } from './traces';
export { mockCurrentSnapshot, mockTelemetrySnapshots, mockTelemetrySeries } from './telemetry';
export { mockArtifacts } from './artifacts';
export { mockFileTree, mockDiagnostics, mockFileContent } from './filesystem';
export { mockActivityItems } from './activity';
export { mockSettings } from './settings';
