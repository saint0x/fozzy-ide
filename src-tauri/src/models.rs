use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoMetadata {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub remote: Option<String>,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessGap {
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub config_path: Option<String>,
    pub scenario_paths: Vec<String>,
    pub trace_paths: Vec<String>,
    pub artifact_paths: Vec<String>,
    pub corpus_paths: Vec<String>,
    pub hidden_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSessionState {
    pub is_indexing: bool,
    pub active_run_id: Option<String>,
    pub last_activity_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub parent_path: String,
    pub trusted: bool,
    pub repo: RepoMetadata,
    pub imported_at: DateTime<Utc>,
    pub last_opened_at: DateTime<Utc>,
    pub scenario_count: usize,
    pub trace_count: usize,
    pub artifact_count: usize,
    pub readiness_gaps: Vec<ReadinessGap>,
    pub scan_summary: ScanSummary,
    pub session: WorkspaceSessionState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioSummary {
    pub path: String,
    pub kind: String,
    pub title: String,
    pub last_modified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioInventory {
    pub workspace_id: String,
    pub scenarios: Vec<ScenarioSummary>,
    pub counts_by_kind: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub id: String,
    pub workspace_id: String,
    pub request_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub trace_path: Option<String>,
    pub stdout_json: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEventEnvelope {
    pub id: String,
    pub family: String,
    pub request_id: String,
    pub run_id: Option<String>,
    pub workspace_id: Option<String>,
    pub kind: String,
    pub at: DateTime<Utc>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPoint {
    pub ts: DateTime<Utc>,
    pub value: f64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySeries {
    pub workspace_id: String,
    pub metric: String,
    pub points: Vec<TelemetryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentApiResponse {
    pub workspace_id: String,
    pub path: String,
    pub language_id: String,
    pub text: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: String,
    pub message: String,
    pub path: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub source: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsResponse {
    pub workspace_id: String,
    pub path: String,
    pub diagnostics: Vec<Diagnostic>,
    pub raw: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoverResponse {
    pub title: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchEdit {
    pub start_line: usize,
    pub end_line: usize,
    pub replacement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeAction {
    pub title: String,
    pub kind: String,
    pub edits: Vec<PatchEdit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSymbol {
    pub name: String,
    pub kind: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDocumentBundle {
    pub workspace_id: String,
    pub path: String,
    pub diagnostics: DiagnosticsResponse,
    pub completions: Vec<CompletionItem>,
    pub hover: Option<HoverResponse>,
    pub symbols: Vec<DocumentSymbol>,
    pub code_actions: Vec<CodeAction>,
    pub semantic_tokens: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationProposal {
    pub title: String,
    pub reason: String,
    pub output_path: String,
    pub contents: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationPreview {
    pub workspace_id: String,
    pub generated_at: DateTime<Utc>,
    pub proposals: Vec<GenerationProposal>,
    pub manifest: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationApplyResult {
    pub workspace_id: String,
    pub applied_paths: Vec<String>,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactSummary {
    pub workspace_id: String,
    pub path: String,
    pub kind: String,
    pub size_bytes: u64,
    pub modified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub id: String,
    pub workspace_id: String,
    pub cwd: String,
    pub shell: String,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub last_output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliResultEnvelope {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout_json: Option<Value>,
    pub stdout_text: String,
    pub stderr_text: String,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceImportRequest {
    pub path: String,
    #[serde(default)]
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLookup {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FsWriteMode {
    CreateOnly,
    OverwriteIfHashMatches,
    UpsertGenerated,
    PreviewPatchThenApply,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    pub workspace_id: String,
    pub relative_path: String,
    pub contents: String,
    pub mode: FsWriteMode,
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FozzyBackend {
    Scripted,
    Host,
    Virtual,
}

impl FozzyBackend {
    pub fn as_cli_value(&self) -> &'static str {
        match self {
            Self::Scripted => "scripted",
            Self::Host => "host",
            Self::Virtual => "virtual",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommonFozzyOptions {
    pub strict: Option<bool>,
    pub json: Option<bool>,
    pub proc_backend: Option<FozzyBackend>,
    pub fs_backend: Option<FozzyBackend>,
    pub http_backend: Option<FozzyBackend>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioArgCommand {
    pub scenario: String,
    #[serde(default)]
    pub common: CommonFozzyOptions,
    pub det: Option<bool>,
    pub seed: Option<u64>,
    pub record: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioListCommand {
    pub scenarios: Vec<String>,
    #[serde(default)]
    pub common: CommonFozzyOptions,
    pub det: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapCommand {
    pub subcommand: String,
    pub root: Option<String>,
    pub scenario_root: Option<String>,
    pub profile: Option<String>,
    #[serde(default)]
    pub common: CommonFozzyOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FozzyCommand {
    Init {
        common: CommonFozzyOptions,
    },
    Run(ScenarioArgCommand),
    Test(ScenarioListCommand),
    Fuzz(ScenarioArgCommand),
    Explore(ScenarioArgCommand),
    Replay {
        trace: String,
        common: CommonFozzyOptions,
    },
    Shrink {
        trace: String,
        common: CommonFozzyOptions,
    },
    TraceVerify {
        trace: String,
        common: CommonFozzyOptions,
    },
    Ci {
        trace: String,
        common: CommonFozzyOptions,
    },
    Report {
        run: Option<String>,
        common: CommonFozzyOptions,
    },
    Artifacts {
        run: Option<String>,
        common: CommonFozzyOptions,
    },
    Profile {
        subcommand: String,
        target: Option<String>,
        common: CommonFozzyOptions,
    },
    Memory {
        run: Option<String>,
        common: CommonFozzyOptions,
    },
    Map(MapCommand),
    Doctor(ScenarioArgCommand),
    Env {
        common: CommonFozzyOptions,
    },
    Gate {
        common: CommonFozzyOptions,
    },
    Schema {
        common: CommonFozzyOptions,
    },
    Validate {
        scenario: String,
        common: CommonFozzyOptions,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FozzyCommandRequest {
    pub workspace_id: String,
    pub request_id: Option<String>,
    pub command: FozzyCommand,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryQuery {
    pub workspace_id: String,
    pub metric: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentQuery {
    pub workspace_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRequest {
    pub workspace_id: String,
    pub include_host_variants: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionRequest {
    pub workspace_id: String,
    pub command: String,
}
