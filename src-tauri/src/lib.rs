mod app_state;
mod artifact_service;
mod commands;
mod db;
mod error;
mod events;
mod fozzy_cli_service;
mod fs_service;
mod lsp_service;
mod models;
mod project_scanner;
mod run_orchestrator;
mod scenario_service;
mod telemetry_service;
mod terminal_service;
mod workspace_registry;

use app_state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = AppState::boot(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::apply_generation,
            commands::create_terminal_session,
            commands::execute_fozzy_command,
            commands::get_document_bundle,
            commands::get_run_events,
            commands::get_scenario_inventory,
            commands::get_telemetry_series,
            commands::get_workspace,
            commands::import_workspace,
            commands::list_artifacts,
            commands::list_runs,
            commands::list_workspaces,
            commands::preview_generation,
            commands::read_document,
            commands::write_workspace_file,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run fozzy platform");
}

#[cfg(test)]
mod tests {
    use crate::fs_service::FsService;
    use crate::models::{FsWriteMode, WriteFileRequest};
    use crate::project_scanner::ProjectScanner;
    use std::fs;

    #[test]
    fn scanner_detects_fozzy_assets() {
        let root = tempfile::tempdir().expect("temp dir");
        fs::write(root.path().join("fozzy.toml"), "name = 'demo'").expect("write config");
        fs::create_dir_all(root.path().join("tests/generated")).expect("create tree");
        fs::write(
            root.path().join("tests/generated/example.run.fozzy.json"),
            "{}",
        )
        .expect("write scenario");
        let scan = ProjectScanner::scan(root.path()).expect("scan");
        assert_eq!(scan.summary.config_path.as_deref(), Some("fozzy.toml"));
        assert_eq!(scan.summary.scenario_paths.len(), 1);
    }

    #[test]
    fn fs_service_rejects_escape() {
        let root = tempfile::tempdir().expect("temp dir");
        let result = FsService::write_confined(
            root.path(),
            &WriteFileRequest {
                workspace_id: "ws".into(),
                relative_path: "../escape.txt".into(),
                contents: "nope".into(),
                mode: FsWriteMode::CreateOnly,
                expected_sha256: None,
            },
        );
        assert!(result.is_err());
    }
}
