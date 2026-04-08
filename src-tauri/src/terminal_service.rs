use crate::db::Db;
use crate::error::AppResult;
use crate::models::TerminalSession;
use chrono::Utc;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::Mutex;
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
        let started_at = Utc::now();
        let session = TerminalSession {
            id: Uuid::new_v4().to_string(),
            workspace_id: workspace_id.to_string(),
            cwd: root.to_string_lossy().to_string(),
            shell: command.to_string(),
            status: "running".into(),
            started_at,
            last_output: format!("$ {command}\n"),
        };
        self.db.insert_terminal_session(&session)?;

        let mut child = Command::new("zsh")
            .arg("-lc")
            .arg(command)
            .current_dir(root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let db = self.db.clone();
        let session_state = Arc::new(Mutex::new(session.clone()));

        let stdout_task = stdout.map(|stream| {
            let db = db.clone();
            let session_state = session_state.clone();
            tokio::spawn(async move {
                stream_terminal_output(db, session_state, stream).await;
            })
        });

        let stderr_task = stderr.map(|stream| {
            let db = db.clone();
            let session_state = session_state.clone();
            tokio::spawn(async move {
                stream_terminal_output(db, session_state, stream).await;
            })
        });

        let final_db = self.db.clone();
        let final_session_state = session_state.clone();
        tokio::spawn(async move {
            if let Some(task) = stdout_task {
                let _ = task.await;
            }
            if let Some(task) = stderr_task {
                let _ = task.await;
            }
            let status = match child.wait().await {
                Ok(exit) if exit.success() => "succeeded",
                Ok(_) => "failed",
                Err(_) => "failed",
            };
            let mut session = final_session_state.lock().await;
            session.status = status.into();
            let _ = final_db.update_terminal_session(&session);
        });

        Ok(session)
    }
}

async fn stream_terminal_output<R>(
    db: Arc<Db>,
    session_state: Arc<Mutex<TerminalSession>>,
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
        let mut session = session_state.lock().await;
        session.last_output.push_str(&chunk);
        trim_terminal_output(&mut session.last_output);
        let _ = db.update_terminal_session(&session);
    }
}

fn trim_terminal_output(output: &mut String) {
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
