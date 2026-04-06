import type {
  Workspace,
  Project,
  Scenario,
  Run,
  Trace,
  TelemetrySnapshot,
  TelemetrySeries,
  Artifact,
  FileNode,
  Diagnostic,
  ActivityItem,
  Settings,
} from '@/types';

export interface WorkspaceRepository {
  list(): Promise<Workspace[]>;
  get(id: string): Promise<Workspace>;
  getRecent(): Promise<Workspace[]>;
  import(path: string): Promise<Workspace>;
}

export interface ProjectRepository {
  list(workspaceId: string): Promise<Project[]>;
  get(id: string): Promise<Project>;
  scan(id: string): Promise<void>;
  initialize(id: string): Promise<void>;
}

export interface ScenarioRepository {
  list(projectId?: string): Promise<Scenario[]>;
  get(id: string): Promise<Scenario>;
  run(id: string): Promise<Run>;
  runAll(projectId: string): Promise<Run[]>;
}

export interface RunRepository {
  list(filters?: { scenarioId?: string; state?: string; limit?: number }): Promise<Run[]>;
  get(id: string): Promise<Run>;
  cancel(id: string): Promise<void>;
  getActive(): Promise<Run[]>;
}

export interface TraceRepository {
  list(runId?: string): Promise<Trace[]>;
  get(id: string): Promise<Trace>;
  replay(id: string): Promise<void>;
  shrink(id: string): Promise<void>;
}

export interface TelemetryRepository {
  getSnapshot(): Promise<TelemetrySnapshot>;
  getSeries(metric: string, range: string): Promise<TelemetrySeries[]>;
  getHistory(limit: number): Promise<TelemetrySnapshot[]>;
}

export interface ArtifactRepository {
  list(runId?: string): Promise<Artifact[]>;
  get(id: string): Promise<Artifact>;
  download(id: string): Promise<void>;
}

export interface FileSystemRepository {
  getTree(rootPath: string): Promise<FileNode>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  getDiagnostics(): Promise<Diagnostic[]>;
}

export interface ActivityRepository {
  getRecent(limit: number): Promise<ActivityItem[]>;
  subscribe(callback: (item: ActivityItem) => void): () => void;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  update(settings: Partial<Settings>): Promise<Settings>;
}
