use crate::db::Db;
use crate::error::AppResult;
use crate::models::TerminalSession;
use chrono::Utc;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;
use uuid::Uuid;

#[derive(Clone)]
pub struct TerminalService {
    db: Arc<Db>,
}

impl TerminalService {
    pub fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub async fn run_command(
        &self,
        workspace_id: &str,
        root: &Path,
        command: &str,
    ) -> AppResult<TerminalSession> {
        let output = Command::new("zsh")
            .arg("-lc")
            .arg(command)
            .current_dir(root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;
        let session = TerminalSession {
            id: Uuid::new_v4().to_string(),
            workspace_id: workspace_id.to_string(),
            cwd: root.to_string_lossy().to_string(),
            shell: "zsh".into(),
            status: if output.status.success() {
                "succeeded".into()
            } else {
                "failed".into()
            },
            started_at: Utc::now(),
            last_output: format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
        };
        self.db.insert_terminal_session(&session)?;
        Ok(session)
    }
}
