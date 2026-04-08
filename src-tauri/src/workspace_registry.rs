use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{
    WorkspaceDetail, WorkspaceProjectSummary, WorkspaceSessionState, WorkspaceSummary,
};
use crate::project_scanner::ProjectScan;
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

    pub fn persist_import(
        &self,
        root: PathBuf,
        trusted: bool,
        scan: ProjectScan,
    ) -> AppResult<WorkspaceSummary> {
        let root_path = root.to_string_lossy().to_string();
        let now = Utc::now();
        let existing = self
            .db
            .list_workspaces()?
            .into_iter()
            .find(|workspace| workspace.root_path == root_path);
        let detail = WorkspaceDetail {
            id: existing
                .as_ref()
                .map(|workspace| workspace.id.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            name: root
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| root_path.clone()),
            root_path,
            parent_path: root
                .parent()
                .map(|parent| parent.to_string_lossy().to_string())
                .unwrap_or_default(),
            trusted,
            repo: scan.repo,
            imported_at: existing
                .as_ref()
                .map(|workspace| workspace.imported_at)
                .unwrap_or(now),
            last_opened_at: now,
            scenario_count: scan.summary.scenario_paths.len(),
            trace_count: scan.summary.trace_paths.len(),
            artifact_count: scan.summary.artifact_paths.len(),
            config_path: scan.summary.config_path,
            readiness_gaps: scan.readiness_gaps,
            session: WorkspaceSessionState {
                is_indexing: false,
                active_run_id: existing
                    .as_ref()
                    .and_then(|workspace| workspace.session.active_run_id.clone()),
                last_activity_at: now,
            },
        };
        let summary = WorkspaceSummary::from(&detail);
        self.db.upsert_workspace(&detail)?;
        self.db
            .upsert_workspace_project(&WorkspaceProjectSummary::from_workspace(&detail))?;
        self.db.upsert_scenario_inventory(
            &detail.id,
            &now.to_rfc3339(),
            &scan.scenarios,
        )?;
        Ok(summary)
    }

    pub fn list_workspaces(&self) -> AppResult<Vec<WorkspaceSummary>> {
        self.db.list_workspaces()
    }

    pub fn set_active_workspace(&self, workspace_id: &str) -> AppResult<()> {
        self.db.touch_workspace(workspace_id, &Utc::now())
    }

    pub fn get_workspace(&self, workspace_id: &str) -> AppResult<WorkspaceSummary> {
        self.db
            .get_workspace(workspace_id)?
            .ok_or_else(|| AppError::NotFound(format!("Unknown workspace {workspace_id}")))
    }

    pub fn get_workspace_detail(&self, workspace_id: &str) -> AppResult<WorkspaceDetail> {
        self.db
            .get_workspace_detail(workspace_id)?
            .ok_or_else(|| AppError::NotFound(format!("Unknown workspace {workspace_id}")))
    }
}
