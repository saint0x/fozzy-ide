use crate::error::AppResult;
use crate::models::{RunEventEnvelope, RunSummary, TerminalSession, WorkspaceSummary};
use parking_lot::Mutex;
use rusqlite::{Connection, params};
use std::path::Path;

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> AppResult<()> {
        self.conn.lock().execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS workspaces (
              id TEXT PRIMARY KEY,
              root_path TEXT NOT NULL UNIQUE,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runs (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              started_at TEXT NOT NULL,
              payload TEXT NOT NULL
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
        "#,
        )?;
        Ok(())
    }

    pub fn upsert_workspace(&self, workspace: &WorkspaceSummary) -> AppResult<()> {
        let payload = serde_json::to_string(workspace)?;
        self.conn.lock().execute(
            "INSERT INTO workspaces (id, root_path, payload) VALUES (?1, ?2, ?3)
             ON CONFLICT(root_path) DO UPDATE SET payload = excluded.payload, id = excluded.id",
            params![workspace.id, workspace.root_path, payload],
        )?;
        Ok(())
    }

    pub fn list_workspaces(&self) -> AppResult<Vec<WorkspaceSummary>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT payload FROM workspaces ORDER BY json_extract(payload, '$.lastOpenedAt') DESC",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        Ok(items)
    }

    pub fn get_workspace(&self, workspace_id: &str) -> AppResult<Option<WorkspaceSummary>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT payload FROM workspaces WHERE id = ?1")?;
        let mut rows = stmt.query(params![workspace_id])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(serde_json::from_str(&row.get::<_, String>(0)?)?));
        }
        Ok(None)
    }

    pub fn insert_run(&self, run: &RunSummary) -> AppResult<()> {
        let payload = serde_json::to_string(run)?;
        self.conn.lock().execute(
            "INSERT OR REPLACE INTO runs (id, workspace_id, started_at, payload) VALUES (?1, ?2, ?3, ?4)",
            params![run.id, run.workspace_id, run.started_at.to_rfc3339(), payload],
        )?;
        Ok(())
    }

    pub fn list_runs(&self, workspace_id: &str) -> AppResult<Vec<RunSummary>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT payload FROM runs WHERE workspace_id = ?1 ORDER BY started_at DESC")?;
        let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(serde_json::from_str(&row?)?);
        }
        Ok(items)
    }

    pub fn insert_event(&self, event: &RunEventEnvelope) -> AppResult<()> {
        let payload = serde_json::to_string(event)?;
        self.conn.lock().execute(
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
        let conn = self.conn.lock();
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
        self.conn.lock().execute(
            "INSERT OR REPLACE INTO terminal_sessions (id, workspace_id, started_at, payload) VALUES (?1, ?2, ?3, ?4)",
            params![session.id, session.workspace_id, session.started_at.to_rfc3339(), payload],
        )?;
        Ok(())
    }
}
