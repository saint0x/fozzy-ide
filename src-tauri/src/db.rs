use crate::error::AppResult;
use crate::models::{
    AppSettings, Diagnostic, RunEventEnvelope, RunListItem, RunSummary, ScenarioSummary,
    TelemetryRollup, TelemetrySample, TerminalSession, WorkspaceDetail, WorkspaceProjectSummary,
    WorkspaceSummary,
};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub struct Db {
    path: PathBuf,
}

struct RunPreviewFields {
    args_json: String,
    stdout_preview: String,
    stderr_preview: String,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let db = Self {
            path: path.to_path_buf(),
        };
        db.migrate()?;
        Ok(db)
    }

    fn connect(&self) -> AppResult<Connection> {
        let conn = Connection::open(&self.path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(conn)
    }

    fn migrate(&self) -> AppResult<()> {
        let conn = self.connect()?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspaces (
              id TEXT PRIMARY KEY,
              root_path TEXT NOT NULL UNIQUE,
              payload TEXT NOT NULL,
              shell_payload TEXT
            );
            CREATE TABLE IF NOT EXISTS runs (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              started_at TEXT NOT NULL,
              payload TEXT NOT NULL,
              command TEXT,
              args_json TEXT,
              status TEXT,
              exit_code INTEGER,
              finished_at TEXT,
              trace_path TEXT,
              stdout_preview TEXT,
              stderr_preview TEXT
            );
            CREATE TABLE IF NOT EXISTS run_events (
              id TEXT PRIMARY KEY,
              workspace_id TEXT,
              run_id TEXT,
              family TEXT NOT NULL,
              happened_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS terminal_sessions (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              started_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scenario_inventory_cache (
              workspace_id TEXT PRIMARY KEY,
              scanned_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspace_projects (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              root_path TEXT NOT NULL,
              payload TEXT NOT NULL,
              UNIQUE(workspace_id, root_path)
            );
            CREATE TABLE IF NOT EXISTS project_inventory_cache (
              project_id TEXT PRIMARY KEY,
              scanned_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS diagnostics_cache (
              workspace_id TEXT PRIMARY KEY,
              refreshed_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS telemetry_samples (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              run_id TEXT,
              metric TEXT NOT NULL,
              captured_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_telemetry_samples_workspace_metric_time
              ON telemetry_samples(workspace_id, metric, captured_at DESC);
            CREATE TABLE IF NOT EXISTS telemetry_rollups (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              metric TEXT NOT NULL,
              bucket TEXT NOT NULL,
              bucket_start TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_rollups_workspace_metric_bucket
              ON telemetry_rollups(workspace_id, metric, bucket, bucket_start);
        "#,
        )?;
        self.ensure_column(&conn, "workspaces", "shell_payload", "TEXT")?;
        self.ensure_column(&conn, "runs", "command", "TEXT")?;
        self.ensure_column(&conn, "runs", "args_json", "TEXT")?;
        self.ensure_column(&conn, "runs", "status", "TEXT")?;
        self.ensure_column(&conn, "runs", "exit_code", "INTEGER")?;
        self.ensure_column(&conn, "runs", "finished_at", "TEXT")?;
        self.ensure_column(&conn, "runs", "trace_path", "TEXT")?;
        self.ensure_column(&conn, "runs", "stdout_preview", "TEXT")?;
        self.ensure_column(&conn, "runs", "stderr_preview", "TEXT")?;
        let default_settings = serde_json::to_string(&AppSettings::default())?;
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, payload) VALUES (1, ?1)",
            params![default_settings],
        )?;
        self.backfill_workspace_shells(&conn)?;
        let compacted = self.compact_workspace_payloads(&conn)?;
        self.backfill_run_previews(&conn)?;
        if compacted {
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")?;
        }
        Ok(())
    }

    fn ensure_column(
        &self,
        conn: &Connection,
        table: &str,
        column: &str,
        definition: &str,
    ) -> AppResult<()> {
        let pragma = format!("PRAGMA table_info({table})");
        let mut stmt = conn.prepare(&pragma)?;
        let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let exists = columns.filter_map(Result::ok).any(|name| name == column);
        if !exists {
            let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
            conn.execute(&alter, [])?;
        }
        Ok(())
    }

    fn backfill_workspace_shells(&self, conn: &Connection) -> AppResult<()> {
        let mut stmt =
            conn.prepare("SELECT id FROM workspaces WHERE shell_payload IS NULL OR shell_payload = ''")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            let id = row?;
            let payload: String = conn.query_row(
                "SELECT payload FROM workspaces WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )?;
            let detail: WorkspaceDetail = serde_json::from_str(&payload)?;
            let shell = serde_json::to_string(&WorkspaceSummary::from(&detail))?;
            conn.execute(
                "UPDATE workspaces SET shell_payload = ?1 WHERE id = ?2",
                params![shell, id],
            )?;
        }
        Ok(())
    }

    fn compact_workspace_payloads(&self, conn: &Connection) -> AppResult<bool> {
        let mut stmt = conn.prepare("SELECT id, payload FROM workspaces")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut compacted_any = false;
        for row in rows {
            let (id, payload) = row?;
            let detail: WorkspaceDetail = serde_json::from_str(&payload)?;
            let compact_payload = serde_json::to_string(&detail)?;
            if compact_payload.len() < payload.len() {
                compacted_any = true;
                conn.execute(
                    "UPDATE workspaces SET payload = ?1, shell_payload = ?2 WHERE id = ?3",
                    params![
                        compact_payload,
                        serde_json::to_string(&WorkspaceSummary::from(&detail))?,
                        id
                    ],
                )?;
            }
        }
        Ok(compacted_any)
    }

    fn backfill_run_previews(&self, conn: &Connection) -> AppResult<()> {
        let mut stmt = conn.prepare(
            "SELECT id, payload FROM runs
             WHERE command IS NULL OR args_json IS NULL OR status IS NULL OR stdout_preview IS NULL OR stderr_preview IS NULL",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, payload) = row?;
            let run: RunSummary = serde_json::from_str(&payload)?;
            let preview = Self::run_preview_fields(&run)?;
            conn.execute(
                "UPDATE runs
                 SET command = ?1, args_json = ?2, status = ?3, exit_code = ?4, finished_at = ?5,
                     trace_path = ?6, stdout_preview = ?7, stderr_preview = ?8
                 WHERE id = ?9",
                params![
                    run.command,
                    preview.args_json,
                    run.status,
                    run.exit_code,
                    run.finished_at.map(|value| value.to_rfc3339()),
                    run.trace_path,
                    preview.stdout_preview,
                    preview.stderr_preview,
                    id
                ],
            )?;
        }
        Ok(())
    }

    fn run_preview_fields(run: &RunSummary) -> AppResult<RunPreviewFields> {
        Ok(RunPreviewFields {
            args_json: serde_json::to_string(&run.args)?,
            stdout_preview: preview_text(&run.stdout_text),
            stderr_preview: preview_text(&run.stderr_text),
        })
    }

    pub fn upsert_workspace(&self, workspace: &WorkspaceDetail) -> AppResult<()> {
        let payload = serde_json::to_string(workspace)?;
        let shell_payload = serde_json::to_string(&WorkspaceSummary::from(workspace))?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO workspaces (id, root_path, payload, shell_payload) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(root_path) DO UPDATE
             SET payload = excluded.payload, shell_payload = excluded.shell_payload, id = excluded.id",
            params![workspace.id, workspace.root_path, payload, shell_payload],
        )?;
        Ok(())
    }

    pub fn list_workspaces(&self) -> AppResult<Vec<WorkspaceSummary>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT shell_payload
             FROM workspaces
             ORDER BY json_extract(shell_payload, '$.lastOpenedAt') DESC",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0))?;
        let mut items = Vec::new();
        for row in rows {
            if let Some(shell_payload) = row? {
                items.push(serde_json::from_str(&shell_payload)?);
            }
        }
        Ok(items)
    }

    pub fn get_workspace(&self, workspace_id: &str) -> AppResult<Option<WorkspaceSummary>> {
        let conn = self.connect()?;
        let shell_payload = conn
            .query_row(
                "SELECT shell_payload FROM workspaces WHERE id = ?1",
                params![workspace_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();
        Ok(shell_payload
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?)
    }

    pub fn get_workspace_detail(&self, workspace_id: &str) -> AppResult<Option<WorkspaceDetail>> {
        let conn = self.connect()?;
        let payload = conn
            .query_row(
                "SELECT payload FROM workspaces WHERE id = ?1",
                params![workspace_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(match payload {
            Some(payload) => Some(serde_json::from_str(&payload)?),
            None => None,
        })
    }

    pub fn touch_workspace(&self, workspace_id: &str, opened_at: &DateTime<Utc>) -> AppResult<()> {
        let Some(mut detail) = self.get_workspace_detail(workspace_id)? else {
            return Ok(());
        };
        detail.last_opened_at = *opened_at;
        detail.session.last_activity_at = *opened_at;
        self.upsert_workspace(&detail)
    }

    pub fn upsert_scenario_inventory(
        &self,
        workspace_id: &str,
        scanned_at: &str,
        scenarios: &[ScenarioSummary],
    ) -> AppResult<()> {
        let payload = serde_json::to_string(scenarios)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO scenario_inventory_cache (workspace_id, scanned_at, payload)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(workspace_id) DO UPDATE
             SET scanned_at = excluded.scanned_at, payload = excluded.payload",
            params![workspace_id, scanned_at, payload],
        )?;
        Ok(())
    }

    pub fn upsert_workspace_project(&self, project: &WorkspaceProjectSummary) -> AppResult<()> {
        let conn = self.connect()?;
        let payload = serde_json::to_string(project)?;
        conn.execute(
            "INSERT INTO workspace_projects (id, workspace_id, root_path, payload)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(workspace_id, root_path) DO UPDATE
             SET id = excluded.id, payload = excluded.payload",
            params![project.id, project.workspace_id, project.root_path, payload],
        )?;
        Ok(())
    }

    pub fn list_workspace_projects(
        &self,
        workspace_id: &str,
    ) -> AppResult<Vec<WorkspaceProjectSummary>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT payload FROM workspace_projects
             WHERE workspace_id = ?1
             ORDER BY json_extract(payload, '$.lastOpenedAt') DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        Ok(items)
    }

    pub fn get_workspace_project(
        &self,
        project_id: &str,
    ) -> AppResult<Option<WorkspaceProjectSummary>> {
        let conn = self.connect()?;
        let payload = conn
            .query_row(
                "SELECT payload FROM workspace_projects WHERE id = ?1",
                params![project_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(match payload {
            Some(payload) => Some(serde_json::from_str(&payload)?),
            None => None,
        })
    }

    pub fn upsert_project_inventory(
        &self,
        project_id: &str,
        scanned_at: &str,
        scenarios: &[ScenarioSummary],
    ) -> AppResult<()> {
        let payload = serde_json::to_string(scenarios)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO project_inventory_cache (project_id, scanned_at, payload)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id) DO UPDATE
             SET scanned_at = excluded.scanned_at, payload = excluded.payload",
            params![project_id, scanned_at, payload],
        )?;
        Ok(())
    }

    pub fn get_project_inventory(
        &self,
        project_id: &str,
    ) -> AppResult<Option<Vec<ScenarioSummary>>> {
        let conn = self.connect()?;
        let payload = conn
            .query_row(
                "SELECT payload FROM project_inventory_cache WHERE project_id = ?1",
                params![project_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(match payload {
            Some(payload) => Some(serde_json::from_str(&payload)?),
            None => None,
        })
    }

    pub fn get_scenario_inventory(
        &self,
        workspace_id: &str,
    ) -> AppResult<Option<Vec<ScenarioSummary>>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT payload FROM scenario_inventory_cache WHERE workspace_id = ?1",
        )?;
        let mut rows = stmt.query(params![workspace_id])?;
        if let Some(row) = rows.next()? {
            let payload: String = row.get(0)?;
            return Ok(Some(serde_json::from_str(&payload)?));
        }
        Ok(None)
    }

    pub fn upsert_diagnostics_cache(
        &self,
        workspace_id: &str,
        refreshed_at: &str,
        diagnostics: &[Diagnostic],
    ) -> AppResult<()> {
        let payload = serde_json::to_string(diagnostics)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO diagnostics_cache (workspace_id, refreshed_at, payload)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(workspace_id) DO UPDATE
             SET refreshed_at = excluded.refreshed_at, payload = excluded.payload",
            params![workspace_id, refreshed_at, payload],
        )?;
        Ok(())
    }

    pub fn get_diagnostics_cache(&self, workspace_id: &str) -> AppResult<Option<Vec<Diagnostic>>> {
        let conn = self.connect()?;
        let mut stmt =
            conn.prepare("SELECT payload FROM diagnostics_cache WHERE workspace_id = ?1")?;
        let mut rows = stmt.query(params![workspace_id])?;
        if let Some(row) = rows.next()? {
            let payload: String = row.get(0)?;
            return Ok(Some(serde_json::from_str(&payload)?));
        }
        Ok(None)
    }

    pub fn insert_run(&self, run: &RunSummary) -> AppResult<()> {
        let payload = serde_json::to_string(run)?;
        let preview = Self::run_preview_fields(run)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO runs
             (id, workspace_id, started_at, payload, command, args_json, status, exit_code, finished_at, trace_path, stdout_preview, stderr_preview)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                run.id,
                run.workspace_id,
                run.started_at.to_rfc3339(),
                payload,
                run.command,
                preview.args_json,
                run.status,
                run.exit_code,
                run.finished_at.map(|value| value.to_rfc3339()),
                run.trace_path,
                preview.stdout_preview,
                preview.stderr_preview
            ],
        )?;
        Ok(())
    }

    pub fn list_runs(
        &self,
        workspace_id: &str,
        limit: Option<usize>,
        active_only: bool,
    ) -> AppResult<Vec<RunListItem>> {
        let conn = self.connect()?;
        let sql = if active_only {
            "SELECT id, workspace_id, command, args_json, status, exit_code, started_at, finished_at, trace_path, stdout_preview, stderr_preview
             FROM runs
             WHERE workspace_id = ?1 AND status = 'running'
             ORDER BY started_at DESC"
        } else {
            "SELECT id, workspace_id, command, args_json, status, exit_code, started_at, finished_at, trace_path, stdout_preview, stderr_preview
             FROM runs
             WHERE workspace_id = ?1
             ORDER BY started_at DESC"
        };
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(RunListItem {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                command: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "pending".into()),
                args: serde_json::from_str(&row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "[]".into()))
                    .unwrap_or_default(),
                status: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "running".into()),
                exit_code: row.get(5)?,
                started_at: parse_datetime(&row.get::<_, String>(6)?)?,
                finished_at: row
                    .get::<_, Option<String>>(7)?
                    .map(|value| parse_datetime(&value))
                    .transpose()?,
                trace_path: row.get(8)?,
                stdout_preview: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                stderr_preview: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
            })
        })?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        if let Some(limit) = limit {
            items.truncate(limit);
        }
        Ok(items)
    }

    pub fn list_run_summaries(&self, workspace_id: &str) -> AppResult<Vec<RunSummary>> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT payload FROM runs WHERE workspace_id = ?1 ORDER BY started_at DESC")?;
        let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        Ok(items)
    }

    pub fn get_run(&self, run_id: &str) -> AppResult<Option<RunSummary>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT payload FROM runs WHERE id = ?1")?;
        let mut rows = stmt.query(params![run_id])?;
        if let Some(row) = rows.next()? {
            let payload: String = row.get(0)?;
            return Ok(Some(serde_json::from_str(&payload)?));
        }
        Ok(None)
    }

    pub fn update_run(&self, run: &RunSummary) -> AppResult<()> {
        self.insert_run(run)
    }

    pub fn insert_event(&self, event: &RunEventEnvelope) -> AppResult<()> {
        let payload = serde_json::to_string(event)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO run_events (id, workspace_id, run_id, family, happened_at, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                event.id,
                event.workspace_id,
                event.run_id,
                event.family,
                event.at.to_rfc3339(),
                payload
            ],
        )?;
        Ok(())
    }

    pub fn list_events(&self, workspace_id: &str) -> AppResult<Vec<RunEventEnvelope>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT payload FROM run_events WHERE workspace_id = ?1 ORDER BY happened_at ASC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        Ok(items)
    }

    pub fn insert_terminal_session(&self, session: &TerminalSession) -> AppResult<()> {
        let payload = serde_json::to_string(session)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO terminal_sessions (id, workspace_id, started_at, payload) VALUES (?1, ?2, ?3, ?4)",
            params![session.id, session.workspace_id, session.started_at.to_rfc3339(), payload],
        )?;
        Ok(())
    }

    pub fn update_terminal_session(&self, session: &TerminalSession) -> AppResult<()> {
        self.insert_terminal_session(session)
    }

    pub fn list_terminal_sessions(&self, workspace_id: &str) -> AppResult<Vec<TerminalSession>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT payload FROM terminal_sessions WHERE workspace_id = ?1 ORDER BY started_at DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        Ok(items)
    }

    pub fn insert_telemetry_sample(&self, sample: &TelemetrySample) -> AppResult<()> {
        let payload = serde_json::to_string(sample)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO telemetry_samples (id, workspace_id, run_id, metric, captured_at, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                sample.id,
                sample.workspace_id,
                sample.run_id,
                sample.metric,
                sample.captured_at.to_rfc3339(),
                payload
            ],
        )?;
        Ok(())
    }

    pub fn list_telemetry_samples(
        &self,
        workspace_id: &str,
        metric: Option<&str>,
        limit: Option<usize>,
    ) -> AppResult<Vec<TelemetrySample>> {
        let conn = self.connect()?;
        let mut items = Vec::new();
        if let Some(metric) = metric {
            let mut stmt = conn.prepare(
                "SELECT payload FROM telemetry_samples
                 WHERE workspace_id = ?1 AND metric = ?2
                 ORDER BY captured_at DESC",
            )?;
            let rows =
                stmt.query_map(params![workspace_id, metric], |row| row.get::<_, String>(0))?;
            for row in rows {
                items.push(serde_json::from_str(&row?)?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT payload FROM telemetry_samples
                 WHERE workspace_id = ?1
                 ORDER BY captured_at DESC",
            )?;
            let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;
            for row in rows {
                items.push(serde_json::from_str(&row?)?);
            }
        }
        if let Some(limit) = limit {
            items.truncate(limit);
        }
        Ok(items)
    }

    pub fn upsert_telemetry_rollup(&self, rollup: &TelemetryRollup) -> AppResult<()> {
        let payload = serde_json::to_string(rollup)?;
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO telemetry_rollups (id, workspace_id, metric, bucket, bucket_start, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(workspace_id, metric, bucket, bucket_start)
             DO UPDATE SET payload = excluded.payload, id = excluded.id",
            params![
                rollup.id,
                rollup.workspace_id,
                rollup.metric,
                rollup.bucket,
                rollup.bucket_start.to_rfc3339(),
                payload
            ],
        )?;
        Ok(())
    }

    pub fn list_telemetry_rollups(
        &self,
        workspace_id: &str,
        metric: &str,
        bucket: &str,
        limit: Option<usize>,
    ) -> AppResult<Vec<TelemetryRollup>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT payload FROM telemetry_rollups
             WHERE workspace_id = ?1 AND metric = ?2 AND bucket = ?3
             ORDER BY bucket_start DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id, metric, bucket], |row| {
            row.get::<_, String>(0)
        })?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        if let Some(limit) = limit {
            items.truncate(limit);
        }
        Ok(items)
    }
}

fn parse_datetime(value: &str) -> rusqlite::Result<DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                value.len(),
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
}

fn preview_text(text: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 2_000;
    if text.chars().count() <= MAX_PREVIEW_CHARS {
        return text.to_string();
    }
    text.chars().take(MAX_PREVIEW_CHARS).collect()
}
