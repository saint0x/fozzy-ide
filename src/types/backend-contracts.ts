export interface RepoMetadata {
  isRepo: boolean;
  branch: string | null;
  head: string | null;
  remote: string | null;
  dirty: boolean;
}

export interface ReadinessGap {
  code: string;
  message: string;
  severity: string;
}

export interface ScanSummary {
  configPath: string | null;
  scenarioPaths: string[];
  tracePaths: string[];
  artifactPaths: string[];
  corpusPaths: string[];
  hiddenPaths: string[];
}

export interface WorkspaceSessionState {
  isIndexing: boolean;
  activeRunId: string | null;
  lastActivityAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  rootPath: string;
  parentPath: string;
  importedAt: string;
  lastOpenedAt: string;
  scenarioCount: number;
  traceCount: number;
  artifactCount: number;
  configPath: string | null;
  readinessGaps: ReadinessGap[];
  session: WorkspaceSessionState;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  rootPath: string;
  parentPath: string;
  trusted: boolean;
  repo: RepoMetadata;
  importedAt: string;
  lastOpenedAt: string;
  scenarioCount: number;
  traceCount: number;
  artifactCount: number;
  configPath: string | null;
  readinessGaps: ReadinessGap[];
  session: WorkspaceSessionState;
}

export interface WorkspaceProjectSummary {
  id: string;
  workspaceId: string;
  name: string;
  rootPath: string;
  parentPath: string;
  importedAt: string;
  lastOpenedAt: string;
  scenarioCount: number;
  traceCount: number;
  artifactCount: number;
  configPath: string | null;
  readinessGaps: ReadinessGap[];
  repo: RepoMetadata;
}

export interface SettingsResponse {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  telemetryEnabled: boolean;
  checkpointInterval: number;
  defaultRunner: string;
  lastWorkspaceId: string | null;
}

export interface AppBootstrap {
  storageRoot: string;
  dbPath: string;
  settings: SettingsResponse;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
}

export interface ScenarioSummary {
  path: string;
  kind: string;
  title: string;
  lastModifiedAt: string | null;
}

export interface ScenarioInventory {
  workspaceId: string;
  scenarios: ScenarioSummary[];
  countsByKind: Record<string, number>;
}

export interface RunSummary {
  id: string;
  workspaceId: string;
  requestId: string;
  command: string;
  args: string[];
  status: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  tracePath: string | null;
  stdoutJson: unknown;
  stdoutText: string;
  stderrText: string;
}

export interface RunListItem {
  id: string;
  workspaceId: string;
  command: string;
  args: string[];
  status: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  tracePath: string | null;
  stdoutPreview: string;
  stderrPreview: string;
}

export interface RunEventEnvelope {
  id: string;
  family: string;
  requestId: string;
  runId: string | null;
  workspaceId: string | null;
  kind: string;
  at: string;
  payload: Record<string, unknown>;
}

export interface TelemetryPoint {
  ts: string;
  value: number;
  label: string | null;
}

export interface TelemetrySeries {
  workspaceId: string;
  metric: string;
  points: TelemetryPoint[];
}

export interface TelemetrySample {
  id: string;
  workspaceId: string;
  runId: string | null;
  metric: string;
  capturedAt: string;
  value: number;
  label: string | null;
  tags: Record<string, unknown>;
}

export interface TelemetryRollup {
  id: string;
  workspaceId: string;
  metric: string;
  bucket: string;
  bucketStart: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  last: number;
}

export interface TelemetrySnapshotResponse {
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

export interface TrendPoint {
  ts: string;
  value: number;
  count: number;
}

export interface TrendSeriesResponse {
  key: string;
  label: string;
  points: TrendPoint[];
}

export interface ScenarioTrend {
  scenarioPath: string;
  totalRuns: number;
  successRate: number;
  avgLatencyMs: number;
  lastStatus: string;
  lastRunAt: string;
}

export interface CommandTrend {
  command: string;
  totalRuns: number;
  successRate: number;
  avgLatencyMs: number;
}

export interface TrendReport {
  workspaceId: string;
  range: string;
  generatedAt: string;
  snapshot: TelemetrySnapshotResponse;
  series: TrendSeriesResponse[];
  topScenarios: ScenarioTrend[];
  commandBreakdown: CommandTrend[];
}

export interface DocumentApiResponse {
  workspaceId: string;
  path: string;
  languageId: string;
  text: string;
  sha256: string;
}

export interface Diagnostic {
  severity: string;
  message: string;
  path: string;
  line: number | null;
  column: number | null;
  source: string;
  code: string | null;
}

export interface DiagnosticsResponse {
  workspaceId: string;
  path: string;
  diagnostics: Diagnostic[];
  raw: unknown;
}

export interface PatchEdit {
  startLine: number;
  endLine: number;
  replacement: string;
}

export interface CodeAction {
  title: string;
  kind: string;
  edits: PatchEdit[];
}

export interface CompletionItem {
  label: string;
  detail: string | null;
  insertText: string | null;
  kind: string;
}

export interface HoverResponse {
  title: string;
  markdown: string;
}

export interface DocumentSymbol {
  name: string;
  kind: string;
  line: number;
}

export interface LspDocumentBundle {
  workspaceId: string;
  path: string;
  diagnostics: DiagnosticsResponse;
  completions: CompletionItem[];
  hover: HoverResponse | null;
  symbols: DocumentSymbol[];
  codeActions: CodeAction[];
  semanticTokens: string[];
}

export interface GenerationProposal {
  title: string;
  reason: string;
  outputPath: string;
  contents: string;
  mode: string;
}

export interface GenerationPreview {
  workspaceId: string;
  generatedAt: string;
  proposals: GenerationProposal[];
  manifest: unknown;
}

export interface GenerationApplyResult {
  workspaceId: string;
  appliedPaths: string[];
  manifestPath: string;
}

export interface ArtifactSummary {
  workspaceId: string;
  path: string;
  kind: string;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface TerminalSession {
  id: string;
  workspaceId: string;
  cwd: string;
  shell: string;
  status: string;
  startedAt: string;
  lastOutput: string;
}

export interface WorkspaceWorkflowResult {
  workspaceId: string;
  workflowId: string;
  mode: string;
  generatedPaths: string[];
  runIds: string[];
  tracePaths: string[];
  scenarioCount: number;
}
