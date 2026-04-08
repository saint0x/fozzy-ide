mod activity_service;
mod app_state;
mod artifact_service;
mod commands;
mod db;
mod error;
mod events;
mod file_tree_service;
mod fozzy_cli_service;
mod fs_service;
mod lsp_service;
mod models;
mod project_scanner;
mod run_orchestrator;
mod scenario_service;
mod settings_service;
mod telemetry_service;
mod terminal_service;
mod workspace_registry;

use app_state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = AppState::boot(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_bootstrap,
            commands::apply_generation,
            commands::cancel_run,
            commands::create_terminal_session,
            commands::execute_workspace_workflow,
            commands::execute_fozzy_command,
            commands::get_activity,
            commands::get_document_bundle,
            commands::get_project,
            commands::get_project_scenario_inventory,
            commands::get_file_tree,
            commands::get_run_events,
            commands::get_run,
            commands::get_scenario_inventory,
            commands::get_telemetry_history,
            commands::get_telemetry_snapshot,
            commands::get_settings,
            commands::get_telemetry_series,
            commands::get_trend_report,
            commands::get_workspace_diagnostics,
            commands::get_workspace,
            commands::get_workspace_detail,
            commands::import_workspace,
            commands::import_project,
            commands::list_artifacts,
            commands::list_projects,
            commands::list_runs,
            commands::list_runs_filtered,
            commands::list_terminal_sessions,
            commands::list_workspaces,
            commands::log_frontend_diagnostic,
            commands::preview_generation,
            commands::read_document,
            commands::scan_project,
            commands::set_active_workspace,
            commands::update_settings,
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
        fs::create_dir_all(root.path().join("corelib/src")).expect("create source tree");
        fs::create_dir_all(root.path().join(".fozzy/runs/demo")).expect("create hidden tree");
        fs::write(
            root.path().join("tests/generated/example.run.fozzy.json"),
            "{}",
        )
        .expect("write scenario");
        fs::write(root.path().join("corelib/src/abi.fzy"), "type ABI = {}").expect("write source");
        fs::write(root.path().join(".fozzy/runs/demo/trace.fozzy"), "{}").expect("write trace");
        let scan = ProjectScanner::scan(root.path()).expect("scan");
        assert_eq!(scan.summary.config_path.as_deref(), Some("fozzy.toml"));
        assert_eq!(scan.summary.scenario_paths.len(), 1);
        assert_eq!(scan.summary.trace_paths.len(), 1);
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
