use crate::app_state::AppState;
use crate::artifact_service::ArtifactService;
use crate::error::AppResult;
use crate::fs_service::FsService;
use crate::models::{
    DocumentApiResponse, DocumentQuery, FozzyCommandRequest, GenerationApplyResult,
    GenerationPreview, GenerationRequest, ScenarioInventory, TelemetryQuery, TerminalSession,
    TerminalSessionRequest, WorkspaceImportRequest, WorkspaceLookup, WorkspaceSummary,
    WriteFileRequest,
};
use crate::project_scanner::ProjectScanner;
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn import_workspace(
    state: State<'_, AppState>,
    request: WorkspaceImportRequest,
) -> AppResult<WorkspaceSummary> {
    state.workspaces.import_workspace(request)
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> AppResult<Vec<WorkspaceSummary>> {
    state.workspaces.list_workspaces()
}

#[tauri::command]
pub fn get_workspace(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<WorkspaceSummary> {
    state.workspaces.get_workspace(&lookup.workspace_id)
}

#[tauri::command]
pub fn get_scenario_inventory(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<ScenarioInventory> {
    let workspace = state.workspaces.get_workspace(&lookup.workspace_id)?;
    let scan = ProjectScanner::scan(Path::new(&workspace.root_path))?;
    Ok(ScenarioInventory {
        workspace_id: workspace.id,
        counts_by_kind: ProjectScanner::counts_by_kind(&scan.scenarios),
        scenarios: scan.scenarios,
    })
}

#[tauri::command]
pub async fn execute_fozzy_command(
    app: AppHandle,
    state: State<'_, AppState>,
    request: FozzyCommandRequest,
) -> AppResult<crate::models::RunSummary> {
    let workspace = state.workspaces.get_workspace(&request.workspace_id)?;
    state.runs.execute(&app, &workspace, request).await
}

#[tauri::command]
pub fn list_runs(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<crate::models::RunSummary>> {
    state.db.list_runs(&lookup.workspace_id)
}

#[tauri::command]
pub fn get_run_events(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<crate::models::RunEventEnvelope>> {
    state.db.list_events(&lookup.workspace_id)
}

#[tauri::command]
pub fn get_telemetry_series(
    state: State<'_, AppState>,
    query: TelemetryQuery,
) -> AppResult<crate::models::TelemetrySeries> {
    state.telemetry.series(&query.workspace_id, &query.metric)
}

#[tauri::command]
pub fn read_document(
    state: State<'_, AppState>,
    query: DocumentQuery,
) -> AppResult<DocumentApiResponse> {
    let workspace = state.workspaces.get_workspace(&query.workspace_id)?;
    let text = FsService::read_confined(Path::new(&workspace.root_path), &query.path)?;
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let language_id = if query.path.ends_with(".json") {
        "json".into()
    } else {
        "text".into()
    };
    Ok(DocumentApiResponse {
        workspace_id: workspace.id,
        path: query.path,
        language_id,
        text,
        sha256: format!("{:x}", hasher.finalize()),
    })
}

#[tauri::command]
pub async fn get_document_bundle(
    state: State<'_, AppState>,
    query: DocumentQuery,
) -> AppResult<crate::models::LspDocumentBundle> {
    let workspace = state.workspaces.get_workspace(&query.workspace_id)?;
    let text = FsService::read_confined(Path::new(&workspace.root_path), &query.path)?;
    state
        .lsp
        .bundle(
            &workspace.id,
            Path::new(&workspace.root_path),
            &query.path,
            &text,
        )
        .await
}

#[tauri::command]
pub async fn preview_generation(
    state: State<'_, AppState>,
    request: GenerationRequest,
) -> AppResult<GenerationPreview> {
    let workspace = state.workspaces.get_workspace(&request.workspace_id)?;
    state
        .scenarios
        .preview(
            &workspace.id,
            Path::new(&workspace.root_path),
            request.include_host_variants,
        )
        .await
}

#[tauri::command]
pub async fn apply_generation(
    state: State<'_, AppState>,
    request: GenerationRequest,
) -> AppResult<GenerationApplyResult> {
    let workspace = state.workspaces.get_workspace(&request.workspace_id)?;
    let preview = state
        .scenarios
        .preview(
            &workspace.id,
            Path::new(&workspace.root_path),
            request.include_host_variants,
        )
        .await?;
    state
        .scenarios
        .apply(&workspace.id, Path::new(&workspace.root_path), &preview)
}

#[tauri::command]
pub fn write_workspace_file(
    state: State<'_, AppState>,
    request: WriteFileRequest,
) -> AppResult<String> {
    let workspace = state.workspaces.get_workspace(&request.workspace_id)?;
    FsService::write_confined(Path::new(&workspace.root_path), &request)
}

#[tauri::command]
pub fn list_artifacts(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<crate::models::ArtifactSummary>> {
    let workspace = state.workspaces.get_workspace(&lookup.workspace_id)?;
    ArtifactService::list(
        &workspace.id,
        Path::new(&workspace.root_path),
        &workspace.scan_summary.artifact_paths,
    )
}

#[tauri::command]
pub async fn create_terminal_session(
    state: State<'_, AppState>,
    request: TerminalSessionRequest,
) -> AppResult<TerminalSession> {
    let workspace = state.workspaces.get_workspace(&request.workspace_id)?;
    state
        .terminal
        .run_command(
            &workspace.id,
            Path::new(&workspace.root_path),
            &request.command,
        )
        .await
}
