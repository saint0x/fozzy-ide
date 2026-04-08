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
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
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
            stdout_text: String::new(),
            stderr_text: String::new(),
        };
        let prepared = self.cli.prepare(Path::new(&workspace.root_path), &request);
        run.command = prepared.command.clone();
        run.args = prepared.args.clone();
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
        let started = std::time::Instant::now();
        let mut child = Command::new("fozzy")
            .args(&prepared.args)
            .current_dir(&prepared.cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let run_state = Arc::new(Mutex::new(run.clone()));
        let stdout_task = stdout.map(|stream| {
            let db = self.db.clone();
            let run_state = run_state.clone();
            tokio::spawn(async move {
                stream_run_output(db, run_state, true, stream).await;
            })
        });
        let stderr_task = stderr.map(|stream| {
            let db = self.db.clone();
            let run_state = run_state.clone();
            tokio::spawn(async move {
                stream_run_output(db, run_state, false, stream).await;
            })
        });
        let status = child.wait().await?;
        await_stream(stdout_task).await;
        await_stream(stderr_task).await;
        run = run_state.lock().await.clone();
        let result = self.cli.finalize(
            prepared,
            run.stdout_text.as_bytes(),
            run.stderr_text.as_bytes(),
            status.code(),
            status.success(),
            started.elapsed().as_millis(),
        );
        run.status = result.status.clone();
        run.exit_code = result.exit_code;
        run.finished_at = Some(Utc::now());
        run.stdout_json = result.stdout_json.clone();
        run.stdout_text = result.stdout_text;
        run.stderr_text = result.stderr_text;
        self.db.update_run(&run)?;
        crate::telemetry_service::TelemetryService::new(self.db.clone()).record_run(
            workspace,
            &run,
            result.duration_ms,
        )?;
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

async fn await_stream(task: Option<JoinHandle<()>>) {
    if let Some(task) = task {
        let _ = task.await;
    }
}

async fn stream_run_output<R>(
    db: Arc<Db>,
    run_state: Arc<Mutex<RunSummary>>,
    stdout: bool,
    mut reader: R,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buffer = [0_u8; 4096];
    loop {
        let read = match reader.read(&mut buffer).await {
            Ok(read) => read,
            Err(_) => break,
        };
        if read == 0 {
            break;
        }
        let chunk = String::from_utf8_lossy(&buffer[..read]);
        let mut run = run_state.lock().await;
        if stdout {
            run.stdout_text.push_str(&chunk);
            trim_output(&mut run.stdout_text);
        } else {
            run.stderr_text.push_str(&chunk);
            trim_output(&mut run.stderr_text);
        }
        let _ = db.update_run(&run);
    }
}

fn trim_output(output: &mut String) {
    const MAX_CHARS: usize = 200_000;
    if output.len() <= MAX_CHARS {
        return;
    }
    let keep_from = output.len().saturating_sub(MAX_CHARS);
    let boundary = output
        .char_indices()
        .find(|(index, _)| *index >= keep_from)
        .map(|(index, _)| index)
        .unwrap_or(0);
    output.drain(..boundary);
}

fn extract_trace_path(command: &FozzyCommand) -> Option<String> {
    match command {
        FozzyCommand::Run(command) => command.record.clone(),
        _ => None,
    }
}
