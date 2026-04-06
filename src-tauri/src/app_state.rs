use crate::artifact_service::ArtifactService;
use crate::db::Db;
use crate::error::AppResult;
use crate::events::EventBus;
use crate::fozzy_cli_service::FozzyCliService;
use crate::lsp_service::LspService;
use crate::run_orchestrator::RunOrchestrator;
use crate::scenario_service::ScenarioService;
use crate::telemetry_service::TelemetryService;
use crate::terminal_service::TerminalService;
use crate::workspace_registry::WorkspaceRegistry;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub workspaces: WorkspaceRegistry,
    pub runs: RunOrchestrator,
    pub telemetry: TelemetryService,
    pub terminal: TerminalService,
    pub lsp: LspService,
    pub scenarios: ScenarioService,
    pub _artifacts: ArtifactService,
    pub _events: EventBus,
    pub _data_dir: PathBuf,
}

impl AppState {
    pub fn boot(app: &AppHandle) -> AppResult<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from(".fozzy-platform"));
        std::fs::create_dir_all(&data_dir)?;
        let db = Arc::new(Db::open(&data_dir.join("fozzy-platform.sqlite"))?);
        let cli = FozzyCliService;
        let events = EventBus::default();
        Ok(Self {
            db: db.clone(),
            workspaces: WorkspaceRegistry::new(db.clone()),
            runs: RunOrchestrator::new(db.clone(), cli.clone(), events.clone()),
            telemetry: TelemetryService::new(db.clone()),
            terminal: TerminalService::new(db),
            lsp: LspService::new(cli.clone()),
            scenarios: ScenarioService::new(cli),
            _artifacts: ArtifactService,
            _events: events,
            _data_dir: data_dir,
        })
    }
}
