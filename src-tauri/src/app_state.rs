use crate::activity_service::ActivityService;
use crate::artifact_service::ArtifactService;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::events::EventBus;
use crate::file_tree_service::FileTreeService;
use crate::fozzy_cli_service::FozzyCliService;
use crate::lsp_service::LspService;
use crate::run_orchestrator::RunOrchestrator;
use crate::scenario_service::ScenarioService;
use crate::settings_service::SettingsService;
use crate::telemetry_service::TelemetryService;
use crate::terminal_service::TerminalService;
use crate::workspace_registry::WorkspaceRegistry;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Manager};
use tokio::sync::OnceCell;

#[derive(Clone)]
pub struct AppServices {
    pub db: Arc<Db>,
    pub workspaces: WorkspaceRegistry,
    pub runs: RunOrchestrator,
    pub telemetry: TelemetryService,
    pub terminal: TerminalService,
    pub lsp: LspService,
    pub scenarios: ScenarioService,
    pub settings: SettingsService,
    pub activity: ActivityService,
    pub file_tree: FileTreeService,
    pub _artifacts: ArtifactService,
    pub events: EventBus,
}

#[derive(Clone)]
pub struct AppState {
    services: Arc<OnceCell<Arc<AppServices>>>,
    data_dir: PathBuf,
    db_path: PathBuf,
    frontend_log_path: PathBuf,
}

impl AppState {
    pub fn boot(app: &AppHandle) -> AppResult<Self> {
        let data_dir = std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join(".fozzy-ide"))
            .unwrap_or_else(|| {
                app.path()
                    .app_data_dir()
                    .unwrap_or_else(|_| PathBuf::from(".fozzy-ide"))
            });
        let db_path = data_dir.join("fozzy.db");
        let frontend_log_path = data_dir.join("state/frontend.log");
        let state = Self {
            services: Arc::new(OnceCell::new()),
            data_dir,
            db_path,
            frontend_log_path,
        };
        let preload = state.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = preload.ready().await {
                eprintln!("[fozzy-backend] background init failed: {error}");
            }
        });
        Ok(state)
    }

    pub async fn ready(&self) -> AppResult<Arc<AppServices>> {
        let data_dir = self.data_dir.clone();
        let db_path = self.db_path.clone();
        self.services
            .get_or_try_init(move || async move {
                tokio::task::spawn_blocking(move || Self::build_services(data_dir, db_path))
                    .await
                    .map_err(|error| {
                        AppError::Validation(format!("Backend initialization task failed: {error}"))
                    })?
            })
            .await
            .cloned()
    }

    pub fn storage_root(&self) -> String {
        self.data_dir.to_string_lossy().to_string()
    }

    pub fn db_path(&self) -> String {
        self.db_path.to_string_lossy().to_string()
    }

    pub fn append_frontend_log(
        &self,
        level: &str,
        scope: &str,
        message: &str,
        context: Option<serde_json::Value>,
    ) -> AppResult<()> {
        if let Some(parent) = self.frontend_log_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let entry = serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "level": level,
            "scope": scope,
            "message": message,
            "context": context,
        });
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.frontend_log_path)?;
        use std::io::Write;
        writeln!(file, "{entry}")?;
        file.sync_data()?;
        Ok(())
    }

    fn build_services(data_dir: PathBuf, db_path: PathBuf) -> AppResult<Arc<AppServices>> {
        let started = Instant::now();
        std::fs::create_dir_all(&data_dir)?;
        std::fs::create_dir_all(data_dir.join("config"))?;
        std::fs::create_dir_all(data_dir.join("state"))?;

        let db = Arc::new(Db::open(&db_path)?);
        let cli = FozzyCliService;
        let events = EventBus::default();
        let services = Arc::new(AppServices {
            db: db.clone(),
            workspaces: WorkspaceRegistry::new(db.clone()),
            runs: RunOrchestrator::new(db.clone(), cli.clone(), events.clone()),
            telemetry: TelemetryService::new(db.clone()),
            terminal: TerminalService::new(db.clone()),
            lsp: LspService::new(cli.clone()),
            scenarios: ScenarioService::new(cli),
            settings: SettingsService::new(data_dir.join("config/settings.json")),
            activity: ActivityService::new(db.clone()),
            file_tree: FileTreeService,
            _artifacts: ArtifactService,
            events,
        });
        eprintln!(
            "[fozzy-backend] AppState boot completed in {}ms",
            started.elapsed().as_millis()
        );
        Ok(services)
    }
}
