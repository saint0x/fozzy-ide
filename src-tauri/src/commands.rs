use crate::app_state::AppState;
use crate::artifact_service::ArtifactService;
use crate::error::{AppError, AppResult};
use crate::fs_service::FsService;
use crate::models::{
    ActivityItem, AppBootstrap, AppSettings, Diagnostic, DocumentApiResponse, DocumentQuery,
    FileNode, FileTreeQuery, FrontendLogRequest, FozzyBackend,
    FozzyCommand, FozzyCommandRequest, GenerationApplyResult, GenerationPreview, GenerationRequest,
    ProjectImportRequest, ProjectLookup,
    RunEventEnvelope, RunListItem, RunSummary, ScenarioArgCommand, ScenarioInventory,
    ScenarioListCommand, SettingsPatch, TelemetryHistoryQuery, TelemetryQuery, TerminalSession,
    TerminalSessionRequest, TrendsQuery, WorkspaceDetail, WorkspaceImportRequest, WorkspaceLookup,
    WorkspaceProjectSummary, WorkspaceSummary, WorkspaceWorkflowRequest,
    WorkspaceWorkflowResult, WriteFileRequest,
};
use crate::project_scanner::ProjectScanner;
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{AppHandle, State};
use tokio::task;
use uuid::Uuid;

#[tauri::command]
pub async fn app_bootstrap(state: State<'_, AppState>) -> AppResult<AppBootstrap> {
    let started = Instant::now();
    let services = state.ready().await?;
    let settings_started = Instant::now();
    let settings = services.settings.get()?;
    let settings_ms = settings_started.elapsed().as_millis();
    let workspaces_started = Instant::now();
    let workspaces = services.workspaces.list_workspaces()?;
    let workspaces_ms = workspaces_started.elapsed().as_millis();
    let active_workspace_id = settings
        .last_workspace_id
        .clone()
        .filter(|workspace_id| workspaces.iter().any(|workspace| workspace.id == *workspace_id))
        .or_else(|| workspaces.first().map(|workspace| workspace.id.clone()));
    eprintln!(
        "[fozzy-backend] app_bootstrap settings={}ms workspaces={} workspaces_ms={} total={}ms",
        settings_ms,
        workspaces.len(),
        workspaces_ms,
        started.elapsed().as_millis()
    );
    Ok(AppBootstrap {
        storage_root: state.storage_root(),
        db_path: state.db_path(),
        settings,
        workspaces,
        active_workspace_id,
    })
}

#[tauri::command]
pub async fn log_frontend_diagnostic(
    state: State<'_, AppState>,
    request: FrontendLogRequest,
) -> AppResult<()> {
    state.append_frontend_log(
        &request.level,
        &request.scope,
        &request.message,
        request.context,
    )
}

#[tauri::command]
pub async fn set_active_workspace(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<AppSettings> {
    let services = state.ready().await?;
    services
        .workspaces
        .set_active_workspace(&lookup.workspace_id)?;
    services
        .settings
        .set_last_workspace_id(Some(lookup.workspace_id))
}

#[tauri::command]
pub async fn import_workspace(
    state: State<'_, AppState>,
    request: WorkspaceImportRequest,
) -> AppResult<WorkspaceSummary> {
    let started = Instant::now();
    let services = state.ready().await?;
    let path = request.path.clone();
    let trusted = request.trusted;
    eprintln!("[fozzy-backend] import_workspace start path={path}");
    let (root, scan) = task::spawn_blocking(move || -> AppResult<_> {
        let root = PathBuf::from(&path).canonicalize()?;
        let scan = ProjectScanner::scan(&root)?;
        Ok((root, scan))
    })
    .await
    .map_err(|error| AppError::Validation(format!("Import task failed: {error}")))??;
    let summary = services.workspaces.persist_import(root, trusted, scan)?;
    services
        .settings
        .set_last_workspace_id(Some(summary.id.clone()))?;
    eprintln!(
        "[fozzy-backend] import_workspace complete workspace_id={} scenarios={} traces={} in {}ms",
        summary.id,
        summary.scenario_count,
        summary.trace_count,
        started.elapsed().as_millis()
    );
    Ok(summary)
}

#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<WorkspaceProjectSummary>> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace_detail(&lookup.workspace_id)?;
    let mut projects = services.db.list_workspace_projects(&lookup.workspace_id)?;
    if projects.is_empty() {
        let primary = WorkspaceProjectSummary::from_workspace(&workspace);
        services.db.upsert_workspace_project(&primary)?;
        projects.push(primary);
    }
    projects.sort_by(|left, right| right.last_opened_at.cmp(&left.last_opened_at));
    Ok(projects)
}

#[tauri::command]
pub async fn get_project(
    state: State<'_, AppState>,
    lookup: ProjectLookup,
) -> AppResult<WorkspaceProjectSummary> {
    let services = state.ready().await?;
    services
        .db
        .get_workspace_project(&lookup.project_id)?
        .ok_or_else(|| AppError::NotFound(format!("Unknown project {}", lookup.project_id)))
}

#[tauri::command]
pub async fn import_project(
    state: State<'_, AppState>,
    request: ProjectImportRequest,
) -> AppResult<WorkspaceProjectSummary> {
    let started = Instant::now();
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace_detail(&request.workspace_id)?;
    let workspace_id = workspace.id.clone();
    let path = request.path.clone();
    let trusted = request.trusted;
    let existing = services.db.list_workspace_projects(&workspace_id)?;
    let (root, scan) = task::spawn_blocking(move || -> AppResult<_> {
        let root = PathBuf::from(&path).canonicalize()?;
        let scan = ProjectScanner::scan(&root)?;
        Ok((root, scan))
    })
    .await
    .map_err(|error| AppError::Validation(format!("Project import task failed: {error}")))??;
    let root_path = root.to_string_lossy().to_string();
    let now = Utc::now();
    let existing_project = existing
        .into_iter()
        .find(|project| project.root_path == root_path);
    let summary = WorkspaceProjectSummary {
        id: existing_project
            .as_ref()
            .map(|project| project.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        workspace_id: workspace_id.clone(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root_path.clone()),
        root_path,
        parent_path: root
            .parent()
            .map(|parent| parent.to_string_lossy().to_string())
            .unwrap_or_default(),
        imported_at: existing_project
            .as_ref()
            .map(|project| project.imported_at)
            .unwrap_or(now),
        last_opened_at: now,
        scenario_count: scan.summary.scenario_paths.len(),
        trace_count: scan.summary.trace_paths.len(),
        artifact_count: scan.summary.artifact_paths.len(),
        config_path: scan.summary.config_path,
        readiness_gaps: scan.readiness_gaps,
        repo: scan.repo,
    };
    services.db.upsert_workspace_project(&summary)?;
    services
        .db
        .upsert_project_inventory(&summary.id, &now.to_rfc3339(), &scan.scenarios)?;
    services
        .settings
        .set_last_workspace_id(Some(workspace_id.clone()))?;
    eprintln!(
        "[fozzy-backend] import_project workspace_id={} project_id={} scenarios={} in {}ms",
        workspace_id,
        summary.id,
        summary.scenario_count,
        started.elapsed().as_millis()
    );
    let _ = trusted;
    Ok(summary)
}

#[tauri::command]
pub async fn scan_project(
    state: State<'_, AppState>,
    lookup: ProjectLookup,
) -> AppResult<WorkspaceProjectSummary> {
    let services = state.ready().await?;
    let project = services
        .db
        .get_workspace_project(&lookup.project_id)?
        .ok_or_else(|| AppError::NotFound(format!("Unknown project {}", lookup.project_id)))?;
    let root_path = project.root_path.clone();
    let scan = task::spawn_blocking(move || ProjectScanner::scan(Path::new(&root_path)))
        .await
        .map_err(|error| AppError::Validation(format!("Project scan task failed: {error}")))??;
    let refreshed = WorkspaceProjectSummary {
        scenario_count: scan.summary.scenario_paths.len(),
        trace_count: scan.summary.trace_paths.len(),
        artifact_count: scan.summary.artifact_paths.len(),
        config_path: scan.summary.config_path,
        readiness_gaps: scan.readiness_gaps,
        repo: scan.repo,
        last_opened_at: Utc::now(),
        ..project
    };
    services.db.upsert_workspace_project(&refreshed)?;
    services.db.upsert_project_inventory(
        &refreshed.id,
        &Utc::now().to_rfc3339(),
        &scan.scenarios,
    )?;
    Ok(refreshed)
}

#[tauri::command]
pub async fn get_project_scenario_inventory(
    state: State<'_, AppState>,
    lookup: ProjectLookup,
) -> AppResult<ScenarioInventory> {
    let started = Instant::now();
    let services = state.ready().await?;
    let project = services
        .db
        .get_workspace_project(&lookup.project_id)?
        .ok_or_else(|| AppError::NotFound(format!("Unknown project {}", lookup.project_id)))?;
    let scenarios = if let Some(cached) = services.db.get_project_inventory(&project.id)? {
        let scenarios = sanitize_scenarios(cached.clone());
        if inventory_changed(&cached, &scenarios) {
            services.db.upsert_project_inventory(
                &project.id,
                &Utc::now().to_rfc3339(),
                &scenarios,
            )?;
            update_project_scenario_count(&services, &project, scenarios.len())?;
        }
        scenarios
    } else {
        let workspace = services.workspaces.get_workspace_detail(&project.workspace_id)?;
        if project.root_path == workspace.root_path {
            if let Some(workspace_cached) = services.db.get_scenario_inventory(&workspace.id)? {
                let workspace_cached_raw = workspace_cached;
                let workspace_cached = sanitize_scenarios(workspace_cached_raw.clone());
                if inventory_changed(&workspace_cached_raw, &workspace_cached) {
                    services.db.upsert_scenario_inventory(
                        &workspace.id,
                        &Utc::now().to_rfc3339(),
                        &workspace_cached,
                    )?;
                    update_workspace_scenario_count(&services, &workspace.id, workspace_cached.len())?;
                }
                services.db.upsert_project_inventory(
                    &project.id,
                    &Utc::now().to_rfc3339(),
                    &workspace_cached,
                )?;
                update_project_scenario_count(&services, &project, workspace_cached.len())?;
                workspace_cached
            } else {
                let root_path = project.root_path.clone();
                let scan = task::spawn_blocking(move || ProjectScanner::scan(Path::new(&root_path)))
                    .await
                    .map_err(|error| AppError::Validation(format!("Project inventory task failed: {error}")))??;
                let scenarios = sanitize_scenarios(scan.scenarios);
                services.db.upsert_project_inventory(
                    &project.id,
                    &Utc::now().to_rfc3339(),
                    &scenarios,
                )?;
                update_project_scenario_count(&services, &project, scenarios.len())?;
                scenarios
            }
        } else {
            let root_path = project.root_path.clone();
            let scan = task::spawn_blocking(move || ProjectScanner::scan(Path::new(&root_path)))
                .await
                .map_err(|error| AppError::Validation(format!("Project inventory task failed: {error}")))??;
            let scenarios = sanitize_scenarios(scan.scenarios);
            services.db.upsert_project_inventory(
                &project.id,
                &Utc::now().to_rfc3339(),
                &scenarios,
            )?;
            update_project_scenario_count(&services, &project, scenarios.len())?;
            scenarios
        }
    };
    eprintln!(
        "[fozzy-backend] get_project_scenario_inventory project_id={} workspace_id={} scenarios={} in {}ms",
        project.id,
        project.workspace_id,
        scenarios.len(),
        started.elapsed().as_millis()
    );
    Ok(ScenarioInventory {
        workspace_id: project.workspace_id,
        counts_by_kind: ProjectScanner::counts_by_kind(&scenarios),
        scenarios,
    })
}

#[tauri::command]
pub async fn list_workspaces(state: State<'_, AppState>) -> AppResult<Vec<WorkspaceSummary>> {
    let started = Instant::now();
    let services = state.ready().await?;
    let workspaces = services.workspaces.list_workspaces()?;
    eprintln!(
        "[fozzy-backend] list_workspaces count={} in {}ms",
        workspaces.len(),
        started.elapsed().as_millis()
    );
    Ok(workspaces)
}

#[tauri::command]
pub async fn get_workspace(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<WorkspaceSummary> {
    let started = Instant::now();
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&lookup.workspace_id)?;
    eprintln!(
        "[fozzy-backend] get_workspace id={} in {}ms",
        lookup.workspace_id,
        started.elapsed().as_millis()
    );
    Ok(workspace)
}

#[tauri::command]
pub async fn get_workspace_detail(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<WorkspaceDetail> {
    let services = state.ready().await?;
    services.workspaces.get_workspace_detail(&lookup.workspace_id)
}

#[tauri::command]
pub async fn get_scenario_inventory(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<ScenarioInventory> {
    let started = Instant::now();
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&lookup.workspace_id)?;
    let scenarios = load_or_refresh_scenario_inventory(&services, &workspace).await?;
    eprintln!(
        "[fozzy-backend] get_scenario_inventory workspace_id={} scenarios={} in {}ms",
        lookup.workspace_id,
        scenarios.len(),
        started.elapsed().as_millis()
    );
    Ok(ScenarioInventory {
        workspace_id: workspace.id,
        counts_by_kind: ProjectScanner::counts_by_kind(&scenarios),
        scenarios,
    })
}

#[tauri::command]
pub async fn execute_fozzy_command(
    app: AppHandle,
    state: State<'_, AppState>,
    request: FozzyCommandRequest,
) -> AppResult<crate::models::RunSummary> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&request.workspace_id)?;
    services.runs.execute(&app, &workspace, request).await
}

#[tauri::command]
pub async fn list_runs(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<RunListItem>> {
    let services = state.ready().await?;
    services.db.list_runs(&lookup.workspace_id, None, false)
}

#[tauri::command]
pub async fn list_runs_filtered(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
    limit: Option<usize>,
    active_only: Option<bool>,
) -> AppResult<Vec<RunListItem>> {
    let services = state.ready().await?;
    services
        .db
        .list_runs(&lookup.workspace_id, limit, active_only.unwrap_or(false))
}

#[tauri::command]
pub async fn get_run(state: State<'_, AppState>, run_id: String) -> AppResult<RunSummary> {
    let services = state.ready().await?;
    services
        .db
        .get_run(&run_id)?
        .ok_or_else(|| AppError::NotFound(format!("Unknown run {run_id}")))
}

#[tauri::command]
pub async fn cancel_run(
    state: State<'_, AppState>,
    run_id: String,
) -> AppResult<crate::models::RunSummary> {
    let services = state.ready().await?;
    let mut run = services
        .db
        .get_run(&run_id)?
        .ok_or_else(|| AppError::NotFound(format!("Unknown run {run_id}")))?;
    run.status = "cancelled".into();
    run.finished_at = Some(chrono::Utc::now());
    services.db.update_run(&run)?;
    Ok(run)
}

#[tauri::command]
pub async fn get_run_events(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<RunEventEnvelope>> {
    let services = state.ready().await?;
    services.db.list_events(&lookup.workspace_id)
}

#[tauri::command]
pub async fn get_telemetry_series(
    state: State<'_, AppState>,
    query: TelemetryQuery,
) -> AppResult<crate::models::TelemetrySeries> {
    let services = state.ready().await?;
    services
        .telemetry
        .series(&query.workspace_id, &query.metric, query.range.as_deref().unwrap_or("24h"))
}

#[tauri::command]
pub async fn get_telemetry_snapshot(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<crate::models::TelemetrySnapshot> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&lookup.workspace_id)?;
    services.telemetry.snapshot(&workspace)
}

#[tauri::command]
pub async fn get_telemetry_history(
    state: State<'_, AppState>,
    query: TelemetryHistoryQuery,
) -> AppResult<Vec<crate::models::TelemetrySnapshot>> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&query.workspace_id)?;
    services.telemetry.history(&workspace, query.limit)
}

#[tauri::command]
pub async fn get_trend_report(
    state: State<'_, AppState>,
    query: TrendsQuery,
) -> AppResult<crate::models::TrendReport> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&query.workspace_id)?;
    services.telemetry.trends(&workspace, &query.range)
}

#[tauri::command]
pub async fn get_workspace_diagnostics(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<Diagnostic>> {
    let started = Instant::now();
    let services = state.ready().await?;
    if let Some(cached) = services.db.get_diagnostics_cache(&lookup.workspace_id)? {
        eprintln!(
            "[fozzy-backend] get_workspace_diagnostics workspace_id={} cache_hit=true diagnostics={} in {}ms",
            lookup.workspace_id,
            cached.len(),
            started.elapsed().as_millis()
        );
        return Ok(cached);
    }
    let workspace = services.workspaces.get_workspace(&lookup.workspace_id)?;
    let diagnostics = refresh_workspace_diagnostics(&services, &workspace).await?;
    eprintln!(
        "[fozzy-backend] get_workspace_diagnostics workspace_id={} cache_hit=false diagnostics={} in {}ms",
        lookup.workspace_id,
        diagnostics.len(),
        started.elapsed().as_millis()
    );
    Ok(diagnostics)
}

#[tauri::command]
pub async fn get_file_tree(
    state: State<'_, AppState>,
    query: FileTreeQuery,
) -> AppResult<FileNode> {
    let started = Instant::now();
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&query.workspace_id)?;
    let file_tree = services.file_tree.clone();
    let root_path = workspace.root_path.clone();
    let max_depth = query.max_depth.unwrap_or(4);
    let max_entries = query.max_entries.unwrap_or(2_000);
    let include_hidden = query.include_hidden.unwrap_or(false);
    let tree = task::spawn_blocking(move || {
        file_tree.build(
            Path::new(&root_path),
            crate::file_tree_service::FileTreeOptions {
                max_depth,
                max_entries,
                include_hidden,
            },
        )
    })
    .await
    .map_err(|error| AppError::Validation(format!("File tree task failed: {error}")))??;
    eprintln!(
        "[fozzy-backend] get_file_tree workspace_id={} in {}ms",
        query.workspace_id,
        started.elapsed().as_millis()
    );
    Ok(tree)
}

#[tauri::command]
pub async fn get_activity(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
    limit: Option<usize>,
) -> AppResult<Vec<ActivityItem>> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&lookup.workspace_id)?;
    services.activity.recent(&workspace, limit.unwrap_or(15))
}

#[tauri::command]
pub async fn read_document(
    state: State<'_, AppState>,
    query: DocumentQuery,
) -> AppResult<DocumentApiResponse> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&query.workspace_id)?;
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
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&query.workspace_id)?;
    let text = FsService::read_confined(Path::new(&workspace.root_path), &query.path)?;
    services
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
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&request.workspace_id)?;
    services
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
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&request.workspace_id)?;
    let preview = services
        .scenarios
        .preview(
            &workspace.id,
            Path::new(&workspace.root_path),
            request.include_host_variants,
        )
        .await?;
    services
        .scenarios
        .apply(&workspace.id, Path::new(&workspace.root_path), &preview)
}

#[tauri::command]
pub async fn write_workspace_file(
    state: State<'_, AppState>,
    request: WriteFileRequest,
) -> AppResult<String> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&request.workspace_id)?;
    FsService::write_confined(Path::new(&workspace.root_path), &request)
}

#[tauri::command]
pub async fn list_artifacts(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<crate::models::ArtifactSummary>> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&lookup.workspace_id)?;
    ArtifactService::list(&workspace.id, Path::new(&workspace.root_path))
}

#[tauri::command]
pub async fn create_terminal_session(
    state: State<'_, AppState>,
    request: TerminalSessionRequest,
) -> AppResult<TerminalSession> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&request.workspace_id)?;
    services
        .terminal
        .run_command(
            &workspace.id,
            Path::new(&workspace.root_path),
            &request.command,
        )
        .await
}

#[tauri::command]
pub async fn list_terminal_sessions(
    state: State<'_, AppState>,
    lookup: WorkspaceLookup,
) -> AppResult<Vec<TerminalSession>> {
    let services = state.ready().await?;
    services.db.list_terminal_sessions(&lookup.workspace_id)
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    let services = state.ready().await?;
    services.settings.get()
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> AppResult<AppSettings> {
    let services = state.ready().await?;
    services.settings.update(patch)
}

#[tauri::command]
pub async fn execute_workspace_workflow(
    app: AppHandle,
    state: State<'_, AppState>,
    request: WorkspaceWorkflowRequest,
) -> AppResult<WorkspaceWorkflowResult> {
    let services = state.ready().await?;
    let workspace = services.workspaces.get_workspace(&request.workspace_id)?;
    let workflow_id = Uuid::new_v4().to_string();
    emit_workflow_event(
        &app,
        &services,
        &workflow_id,
        &workspace.id,
        "workflowStarted",
        serde_json::json!({ "mode": request.mode }),
    )?;

    let mut generated_paths = Vec::new();
    if request.mode.contains("generate") || request.include_host_variants {
        let preview = services
            .scenarios
            .preview(
                &workspace.id,
                Path::new(&workspace.root_path),
                request.include_host_variants,
            )
            .await?;
        let applied = services
            .scenarios
            .apply(&workspace.id, Path::new(&workspace.root_path), &preview)?;
        generated_paths = applied.applied_paths;
        emit_workflow_event(
            &app,
            &services,
            &workflow_id,
            &workspace.id,
            "generationApplied",
            serde_json::json!({ "generatedPaths": generated_paths }),
        )?;
    }

    let scan = task::spawn_blocking({
        let root_path = workspace.root_path.clone();
        move || ProjectScanner::scan(Path::new(&root_path))
    })
    .await
    .map_err(|error| AppError::Validation(format!("Workflow scan task failed: {error}")))??;
    let scenarios = sanitize_scenarios(scan.scenarios);
    services.db.upsert_scenario_inventory(
        &workspace.id,
        &Utc::now().to_rfc3339(),
        &scenarios,
    )?;
    let scenario_paths: Vec<String> = scenarios.iter().map(|scenario| scenario.path.clone()).collect();
    let mut run_ids = Vec::new();
    let mut trace_paths = Vec::new();

    if !scenario_paths.is_empty() {
        let strict_suite = services
            .runs
            .execute(
                &app,
                &workspace,
                FozzyCommandRequest {
                    workspace_id: workspace.id.clone(),
                    request_id: Some(workflow_id.clone()),
                    command: FozzyCommand::Test(ScenarioListCommand {
                        scenarios: scenario_paths.clone(),
                        common: Default::default(),
                        det: Some(true),
                    }),
                },
            )
            .await?;
        run_ids.push(strict_suite.id.clone());
    }

    for scenario in scenarios {
        let request_id = Some(workflow_id.clone());
        let scenario_kind = detect_scenario_kind(&scenario.path);

        let doctor_run = services
            .runs
            .execute(
                &app,
                &workspace,
                FozzyCommandRequest {
                    workspace_id: workspace.id.clone(),
                    request_id: request_id.clone(),
                    command: FozzyCommand::Doctor(ScenarioArgCommand {
                        scenario: scenario.path.clone(),
                        common: Default::default(),
                        det: Some(true),
                        seed: Some(7),
                        record: None,
                    }),
                },
            )
            .await?;
        run_ids.push(doctor_run.id);

        match scenario_kind {
            "fuzz" => {
                let run = execute_scenario_command(
                    &app,
                    &services,
                    &workspace,
                    request_id.clone(),
                    FozzyCommand::Fuzz(ScenarioArgCommand {
                        scenario: scenario.path.clone(),
                        common: Default::default(),
                        det: Some(true),
                        seed: Some(7),
                        record: None,
                    }),
                )
                .await?;
                run_ids.push(run.id);
            }
            "explore" => {
                let run = execute_scenario_command(
                    &app,
                    &services,
                    &workspace,
                    request_id.clone(),
                    FozzyCommand::Explore(ScenarioArgCommand {
                        scenario: scenario.path.clone(),
                        common: Default::default(),
                        det: Some(true),
                        seed: Some(7),
                        record: None,
                    }),
                )
                .await?;
                run_ids.push(run.id);
            }
            _ => {
                let trace_path = format!(
                    "artifacts/{}.trace.fozzy",
                    scenario
                        .title
                        .replace(".fozzy", "")
                        .replace(".json", "")
                        .replace('/', "-")
                );
                let run = execute_scenario_command(
                    &app,
                    &services,
                    &workspace,
                    request_id.clone(),
                    FozzyCommand::Run(ScenarioArgCommand {
                        scenario: scenario.path.clone(),
                        common: if scenario_kind == "host" {
                            host_common()
                        } else {
                            Default::default()
                        },
                        det: Some(true),
                        seed: Some(7),
                        record: Some(trace_path.clone()),
                    }),
                )
                .await?;
                run_ids.push(run.id.clone());
                trace_paths.push(trace_path.clone());

                for command in [
                    FozzyCommand::TraceVerify {
                        trace: trace_path.clone(),
                        common: Default::default(),
                    },
                    FozzyCommand::Replay {
                        trace: trace_path.clone(),
                        common: if scenario_kind == "host" {
                            host_common()
                        } else {
                            Default::default()
                        },
                    },
                    FozzyCommand::Ci {
                        trace: trace_path.clone(),
                        common: Default::default(),
                    },
                ] {
                    let verification_run = execute_scenario_command(
                        &app,
                        &services,
                        &workspace,
                        request_id.clone(),
                        command,
                    )
                    .await?;
                    run_ids.push(verification_run.id);
                }
            }
        }
    }

    emit_workflow_event(
        &app,
        &services,
        &workflow_id,
        &workspace.id,
        "workflowFinished",
        serde_json::json!({
            "mode": request.mode,
            "generatedPaths": generated_paths,
            "runCount": run_ids.len(),
            "tracePaths": trace_paths,
        }),
    )?;

    Ok(WorkspaceWorkflowResult {
        workspace_id: workspace.id,
        workflow_id,
        mode: request.mode,
        generated_paths,
        run_ids,
        trace_paths,
        scenario_count: scenario_paths.len(),
    })
}

async fn load_or_refresh_scenario_inventory(
    services: &crate::app_state::AppServices,
    workspace: &WorkspaceSummary,
) -> AppResult<Vec<crate::models::ScenarioSummary>> {
    if let Some(cached) = services.db.get_scenario_inventory(&workspace.id)? {
        let scenarios = sanitize_scenarios(cached.clone());
        if inventory_changed(&cached, &scenarios) {
            services.db.upsert_scenario_inventory(
                &workspace.id,
                &Utc::now().to_rfc3339(),
                &scenarios,
            )?;
            update_workspace_scenario_count(services, &workspace.id, scenarios.len())?;
        }
        return Ok(scenarios);
    }
    let root_path = workspace.root_path.clone();
    let scan = task::spawn_blocking(move || ProjectScanner::scan(Path::new(&root_path)))
        .await
        .map_err(|error| AppError::Validation(format!("Scenario inventory task failed: {error}")))??;
    let scenarios = sanitize_scenarios(scan.scenarios);
    services.db.upsert_scenario_inventory(
        &workspace.id,
        &Utc::now().to_rfc3339(),
        &scenarios,
    )?;
    Ok(scenarios)
}

fn sanitize_scenarios(
    scenarios: Vec<crate::models::ScenarioSummary>,
) -> Vec<crate::models::ScenarioSummary> {
    scenarios
        .into_iter()
        .filter(|scenario| is_valid_scenario_path(&scenario.path))
        .collect()
}

fn inventory_changed(
    original: &[crate::models::ScenarioSummary],
    sanitized: &[crate::models::ScenarioSummary],
) -> bool {
    if original.len() != sanitized.len() {
        return true;
    }
    original
        .iter()
        .zip(sanitized.iter())
        .any(|(left, right)| left.path != right.path)
}

fn update_workspace_scenario_count(
    services: &crate::app_state::AppServices,
    workspace_id: &str,
    scenario_count: usize,
) -> AppResult<()> {
    if let Some(mut detail) = services.db.get_workspace_detail(workspace_id)? {
        if detail.scenario_count != scenario_count {
            detail.scenario_count = scenario_count;
            services.db.upsert_workspace(&detail)?;
        }
    }
    Ok(())
}

fn update_project_scenario_count(
    services: &crate::app_state::AppServices,
    project: &crate::models::WorkspaceProjectSummary,
    scenario_count: usize,
) -> AppResult<()> {
    if project.scenario_count != scenario_count {
        let mut refreshed = project.clone();
        refreshed.scenario_count = scenario_count;
        services.db.upsert_workspace_project(&refreshed)?;
        if refreshed.root_path
            == services
                .db
                .get_workspace_detail(&refreshed.workspace_id)?
                .map(|workspace| workspace.root_path)
                .unwrap_or_default()
        {
            update_workspace_scenario_count(services, &refreshed.workspace_id, scenario_count)?;
        }
    }
    Ok(())
}

fn is_valid_scenario_path(path: &str) -> bool {
    if path.starts_with(".fozzy/") || path.contains("/.fozzy/") {
        return false;
    }
    if path.contains("trace") || path.ends_with(".trace.fozzy") || path.ends_with(".fozzytrace") {
        return false;
    }
    path.ends_with(".fozzy.json")
}

async fn refresh_workspace_diagnostics(
    services: &crate::app_state::AppServices,
    workspace: &WorkspaceSummary,
) -> AppResult<Vec<Diagnostic>> {
    let scenarios = load_or_refresh_scenario_inventory(services, workspace).await?;
    let mut join_set = tokio::task::JoinSet::new();
    for scenario in scenarios {
        let lsp = services.lsp.clone();
        let workspace_id = workspace.id.clone();
        let root_path = workspace.root_path.clone();
        join_set.spawn(async move {
            lsp.diagnostics(&workspace_id, Path::new(&root_path), &scenario.path)
                .await
                .map(|response| response.diagnostics)
        });
    }
    let mut diagnostics = Vec::new();
    while let Some(result) = join_set.join_next().await {
        diagnostics.extend(
            result
                .map_err(|error| AppError::Validation(format!("Diagnostics task failed: {error}")))??,
        );
    }
    diagnostics.sort_by(|left, right| left.path.cmp(&right.path).then(left.line.cmp(&right.line)));
    services.db.upsert_diagnostics_cache(
        &workspace.id,
        &Utc::now().to_rfc3339(),
        &diagnostics,
    )?;
    Ok(diagnostics)
}

async fn execute_scenario_command(
    app: &AppHandle,
    services: &crate::app_state::AppServices,
    workspace: &WorkspaceSummary,
    request_id: Option<String>,
    command: FozzyCommand,
) -> AppResult<crate::models::RunSummary> {
    services
        .runs
        .execute(
            app,
            workspace,
            FozzyCommandRequest {
                workspace_id: workspace.id.clone(),
                request_id,
                command,
            },
        )
        .await
}

fn emit_workflow_event(
    app: &AppHandle,
    services: &crate::app_state::AppServices,
    workflow_id: &str,
    workspace_id: &str,
    kind: &str,
    payload: serde_json::Value,
) -> AppResult<()> {
    let event = RunEventEnvelope {
        id: Uuid::new_v4().to_string(),
        family: "workflow".into(),
        request_id: workflow_id.to_string(),
        run_id: None,
        workspace_id: Some(workspace_id.to_string()),
        kind: kind.to_string(),
        at: Utc::now(),
        payload,
    };
    services.db.insert_event(&event)?;
    services.events.emit(app, event);
    Ok(())
}

fn detect_scenario_kind(path: &str) -> &'static str {
    if path.contains("fuzz") {
        "fuzz"
    } else if path.contains("explore") {
        "explore"
    } else if path.contains("host") {
        "host"
    } else if path.contains("memory") {
        "memory"
    } else {
        "run"
    }
}

fn host_common() -> crate::models::CommonFozzyOptions {
    crate::models::CommonFozzyOptions {
        strict: Some(true),
        json: Some(true),
        proc_backend: Some(FozzyBackend::Host),
        fs_backend: Some(FozzyBackend::Host),
        http_backend: Some(FozzyBackend::Host),
        cwd: None,
    }
}
