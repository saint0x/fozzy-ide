// ── Workspace ──────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  lastOpened: string;
  starred: boolean;
  status: 'healthy' | 'warning' | 'error' | 'initializing';
  testCount: number;
  passingCount: number;
  failingCount: number;
  coveragePercent: number;
}

// ── Project ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  language: 'rust' | 'typescript' | 'python' | 'go' | 'c' | 'cpp';
  scanState: 'pending' | 'scanning' | 'complete' | 'error';
  configStatus: 'unconfigured' | 'configured' | 'invalid';
  scenarioCount: number;
  lastScanned: string | null;
}

// ── Scenario (test) ────────────────────────────────────────────────────────────

export type ScenarioType = 'run' | 'test' | 'fuzz' | 'explore' | 'memory' | 'host' | 'generated';
export type ScenarioStatus = 'passing' | 'failing' | 'flaky' | 'skipped' | 'unknown';

export interface Scenario {
  id: string;
  projectId: string;
  name: string;
  type: ScenarioType;
  status: ScenarioStatus;
  filePath: string;
  line: number;
  lastRun: string | null;
  duration: number | null; // ms
  tags: string[];
}

// ── Run ────────────────────────────────────────────────────────────────────────

export type RunState = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'timeout';

export interface Run {
  id: string;
  scenarioId: string;
  scenarioName: string;
  projectName: string;
  state: RunState;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  artifacts: string[];
  traceId: string | null;
}

// ── Trace ──────────────────────────────────────────────────────────────────────

export type TracePhase = 'verify' | 'replay' | 'shrink';

export interface Trace {
  id: string;
  runId: string;
  scenarioName: string;
  phase: TracePhase;
  status: 'pending' | 'running' | 'complete' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  inputSize: number;
  shrunkSize: number | null;
  steps: TraceStep[];
}

export interface TraceStep {
  id: string;
  timestamp: string;
  action: string;
  input: string;
  output: string;
  passed: boolean;
}

// ── Telemetry ──────────────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
  timestamp: string;
  passRate: number;
  failRate: number;
  totalRuns: number;
  avgLatency: number;
  flakeSignals: number;
  memoryUsageMb: number;
  exploreProgress: number;
  fuzzProgress: number;
}

export interface TelemetrySeries {
  label: string;
  data: { timestamp: string; value: number }[];
  color: string;
}

// ── Artifact ───────────────────────────────────────────────────────────────────

export interface Artifact {
  id: string;
  runId: string;
  name: string;
  type: 'report' | 'log' | 'coverage' | 'trace' | 'screenshot' | 'binary';
  path: string;
  size: number;
  createdAt: string;
}

// ── Editor ─────────────────────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  language?: string;
}

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  language: string;
  dirty: boolean;
  content: string;
}

export interface Diagnostic {
  id: string;
  filePath: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source: string;
}

// ── Activity ───────────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: 'run_started' | 'run_passed' | 'run_failed' | 'scan_complete' | 'trace_complete' | 'warning';
  message: string;
  timestamp: string;
  link?: string;
}

// ── Settings ───────────────────────────────────────────────────────────────────

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  telemetryEnabled: boolean;
  checkpointInterval: number;
  defaultRunner: string;
}

export * from './backend-contracts';
