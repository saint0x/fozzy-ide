use crate::db::Db;
use crate::error::AppResult;
use crate::events::EventBus;
use crate::fozzy_cli_service::FozzyCliService;
use crate::models::{
    FozzyCommand, FozzyCommandRequest, RunEventEnvelope, RunSummary, WorkspaceSummary,
};
use chrono::Utc;
use std::path::Path;
use std::sync::Arc;
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Clone)]
pub struct RunOrchestrator {
    db: Arc<Db>,
    cli: FozzyCliService,
    bus: EventBus,
}

impl RunOrchestrator {
    pub fn new(db: Arc<Db>, cli: FozzyCliService, bus: EventBus) -> Self {
        Self { db, cli, bus }
    }

    pub async fn execute(
        &self,
        app: &AppHandle,
        workspace: &WorkspaceSummary,
        request: FozzyCommandRequest,
    ) -> AppResult<RunSummary> {
        let run_id = Uuid::new_v4().to_string();
        let request_id = request
            .request_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let mut run = RunSummary {
            id: run_id.clone(),
            workspace_id: workspace.id.clone(),
            request_id: request_id.clone(),
            command: "pending".into(),
            args: Vec::new(),
            status: "running".into(),
            exit_code: None,
            started_at: Utc::now(),
            finished_at: None,
            trace_path: extract_trace_path(&request.command),
            stdout_json: None,
        };
        self.db.insert_run(&run)?;
        self.persist_event(
            app,
            RunEventEnvelope {
                id: Uuid::new_v4().to_string(),
                family: "runLifecycle".into(),
                request_id: request_id.clone(),
                run_id: Some(run_id),
                workspace_id: Some(workspace.id.clone()),
                kind: "runStarted".into(),
                at: Utc::now(),
                payload: serde_json::json!({
                    "command": format!("{:?}", request.command),
                }),
            },
        )?;

        let result = self
            .cli
            .execute(Path::new(&workspace.root_path), &request)
            .await?;
        run.command = result.command.clone();
        run.args = result.args.clone();
        run.status = result.status.clone();
        run.exit_code = result.exit_code;
        run.finished_at = Some(Utc::now());
        run.stdout_json = result.stdout_json.clone();
        self.db.insert_run(&run)?;
        self.persist_event(
            app,
            RunEventEnvelope {
                id: Uuid::new_v4().to_string(),
                family: "runLifecycle".into(),
                request_id,
                run_id: Some(run.id.clone()),
                workspace_id: Some(workspace.id.clone()),
                kind: "runFinished".into(),
                at: Utc::now(),
                payload: serde_json::json!({
                    "durationMs": result.duration_ms,
                    "exitCode": result.exit_code,
                    "status": result.status,
                }),
            },
        )?;
        Ok(run)
    }

    fn persist_event(&self, app: &AppHandle, event: RunEventEnvelope) -> AppResult<()> {
        self.db.insert_event(&event)?;
        self.bus.emit(app, event);
        Ok(())
    }
}

fn extract_trace_path(command: &FozzyCommand) -> Option<String> {
    match command {
        FozzyCommand::Run(command) => command.record.clone(),
        _ => None,
    }
}
