use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{WorkspaceImportRequest, WorkspaceSessionState, WorkspaceSummary};
use crate::project_scanner::ProjectScanner;
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct WorkspaceRegistry {
    db: Arc<Db>,
}

impl WorkspaceRegistry {
    pub fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn import_workspace(&self, request: WorkspaceImportRequest) -> AppResult<WorkspaceSummary> {
        let root = PathBuf::from(&request.path).canonicalize()?;
        let root_path = root.to_string_lossy().to_string();
        if let Some(existing) = self
            .db
            .list_workspaces()?
            .into_iter()
            .find(|workspace| workspace.root_path == root_path)
        {
            return Ok(existing);
        }
        let scan = ProjectScanner::scan(&root)?;
        let now = Utc::now();
        let summary = WorkspaceSummary {
            id: Uuid::new_v4().to_string(),
            name: root
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| root_path.clone()),
            root_path,
            parent_path: root
                .parent()
                .map(|parent| parent.to_string_lossy().to_string())
                .unwrap_or_default(),
            trusted: request.trusted,
            repo: scan.repo,
            imported_at: now,
            last_opened_at: now,
            scenario_count: scan.summary.scenario_paths.len(),
            trace_count: scan.summary.trace_paths.len(),
            artifact_count: scan.summary.artifact_paths.len(),
            readiness_gaps: scan.readiness_gaps,
            scan_summary: scan.summary,
            session: WorkspaceSessionState {
                is_indexing: false,
                active_run_id: None,
                last_activity_at: now,
            },
        };
        self.db.upsert_workspace(&summary)?;
        Ok(summary)
    }

    pub fn list_workspaces(&self) -> AppResult<Vec<WorkspaceSummary>> {
        self.db.list_workspaces()
    }

    pub fn get_workspace(&self, workspace_id: &str) -> AppResult<WorkspaceSummary> {
        self.db
            .get_workspace(workspace_id)?
            .ok_or_else(|| AppError::NotFound(format!("Unknown workspace {workspace_id}")))
    }
}
