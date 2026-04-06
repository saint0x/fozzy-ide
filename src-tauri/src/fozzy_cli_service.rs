use crate::error::AppResult;
use crate::models::{
    CliResultEnvelope, CommonFozzyOptions, FozzyCommand, FozzyCommandRequest, MapCommand,
    ScenarioArgCommand, ScenarioListCommand,
};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Instant;
use tokio::process::Command;

#[derive(Clone, Default)]
pub struct FozzyCliService;

impl FozzyCliService {
    pub async fn execute(
        &self,
        workspace_root: &Path,
        request: &FozzyCommandRequest,
    ) -> AppResult<CliResultEnvelope> {
        let (command, mut args, cwd) = build_args(workspace_root, &request.command);
        args.insert(0, command.clone());
        let started = Instant::now();
        let output = Command::new("fozzy")
            .args(&args)
            .current_dir(&cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;
        let stdout_text = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr_text = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout_json = serde_json::from_slice(&output.stdout).ok();
        Ok(CliResultEnvelope {
            command,
            args,
            cwd: cwd.to_string_lossy().to_string(),
            status: if output.status.success() {
                "succeeded".into()
            } else {
                "failed".into()
            },
            exit_code: output.status.code(),
            stdout_json,
            stdout_text,
            stderr_text,
            duration_ms: started.elapsed().as_millis(),
        })
    }
}

fn build_args(workspace_root: &Path, command: &FozzyCommand) -> (String, Vec<String>, PathBuf) {
    let mut args = Vec::new();
    let (command_name, cwd) = match command {
        FozzyCommand::Init { common } => (
            "init".to_string(),
            append_common(workspace_root, &mut args, common),
        ),
        FozzyCommand::Run(cmd) => (
            "run".to_string(),
            append_scenario_command(workspace_root, &mut args, cmd),
        ),
        FozzyCommand::Test(cmd) => (
            "test".to_string(),
            append_scenario_list_command(workspace_root, &mut args, cmd),
        ),
        FozzyCommand::Fuzz(cmd) => (
            "fuzz".to_string(),
            append_scenario_command(workspace_root, &mut args, cmd),
        ),
        FozzyCommand::Explore(cmd) => (
            "explore".to_string(),
            append_scenario_command(workspace_root, &mut args, cmd),
        ),
        FozzyCommand::Replay { trace, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            args.push(trace.clone());
            ("replay".to_string(), cwd)
        }
        FozzyCommand::Shrink { trace, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            args.push(trace.clone());
            ("shrink".to_string(), cwd)
        }
        FozzyCommand::TraceVerify { trace, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            args.push("verify".into());
            args.push(trace.clone());
            ("trace".to_string(), cwd)
        }
        FozzyCommand::Ci { trace, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            args.push(trace.clone());
            ("ci".to_string(), cwd)
        }
        FozzyCommand::Report { run, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            if let Some(run) = run {
                args.push(run.clone());
            }
            ("report".to_string(), cwd)
        }
        FozzyCommand::Artifacts { run, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            if let Some(run) = run {
                args.push(run.clone());
            }
            ("artifacts".to_string(), cwd)
        }
        FozzyCommand::Profile {
            subcommand,
            target,
            common,
        } => {
            let cwd = append_common(workspace_root, &mut args, common);
            args.push(subcommand.clone());
            if let Some(target) = target {
                args.push(target.clone());
            }
            ("profile".to_string(), cwd)
        }
        FozzyCommand::Memory { run, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            if let Some(run) = run {
                args.push(run.clone());
            }
            ("memory".to_string(), cwd)
        }
        FozzyCommand::Map(cmd) => (
            "map".to_string(),
            append_map_command(workspace_root, &mut args, cmd),
        ),
        FozzyCommand::Doctor(cmd) => (
            "doctor".to_string(),
            append_scenario_command(workspace_root, &mut args, cmd),
        ),
        FozzyCommand::Env { common } => (
            "env".to_string(),
            append_common(workspace_root, &mut args, common),
        ),
        FozzyCommand::Gate { common } => (
            "gate".to_string(),
            append_common(workspace_root, &mut args, common),
        ),
        FozzyCommand::Schema { common } => (
            "schema".to_string(),
            append_common(workspace_root, &mut args, common),
        ),
        FozzyCommand::Validate { scenario, common } => {
            let cwd = append_common(workspace_root, &mut args, common);
            args.push(scenario.clone());
            ("validate".to_string(), cwd)
        }
    };
    (command_name, args, cwd)
}

fn append_common(
    workspace_root: &Path,
    args: &mut Vec<String>,
    common: &CommonFozzyOptions,
) -> PathBuf {
    let cwd = common
        .cwd
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| workspace_root.to_path_buf());
    if common.json.unwrap_or(true) {
        args.push("--json".into());
    }
    if common.strict.unwrap_or(true) {
        args.push("--strict".into());
    } else {
        args.push("--unsafe".into());
    }
    if let Some(proc_backend) = &common.proc_backend {
        args.push("--proc-backend".into());
        args.push(proc_backend.as_cli_value().into());
    }
    if let Some(fs_backend) = &common.fs_backend {
        args.push("--fs-backend".into());
        args.push(fs_backend.as_cli_value().into());
    }
    if let Some(http_backend) = &common.http_backend {
        args.push("--http-backend".into());
        args.push(http_backend.as_cli_value().into());
    }
    cwd
}

fn append_scenario_command(
    workspace_root: &Path,
    args: &mut Vec<String>,
    cmd: &ScenarioArgCommand,
) -> PathBuf {
    let cwd = append_common(workspace_root, args, &cmd.common);
    if cmd.det.unwrap_or(false) {
        args.push("--det".into());
    }
    if let Some(seed) = cmd.seed {
        args.push("--seed".into());
        args.push(seed.to_string());
    }
    if let Some(record) = &cmd.record {
        args.push("--record".into());
        args.push(record.clone());
    }
    args.push(cmd.scenario.clone());
    cwd
}

fn append_scenario_list_command(
    workspace_root: &Path,
    args: &mut Vec<String>,
    cmd: &ScenarioListCommand,
) -> PathBuf {
    let cwd = append_common(workspace_root, args, &cmd.common);
    if cmd.det.unwrap_or(false) {
        args.push("--det".into());
    }
    args.extend(cmd.scenarios.clone());
    cwd
}

fn append_map_command(workspace_root: &Path, args: &mut Vec<String>, cmd: &MapCommand) -> PathBuf {
    let cwd = append_common(workspace_root, args, &cmd.common);
    args.push(cmd.subcommand.clone());
    if let Some(root) = &cmd.root {
        args.push("--root".into());
        args.push(root.clone());
    }
    if let Some(scenario_root) = &cmd.scenario_root {
        args.push("--scenario-root".into());
        args.push(scenario_root.clone());
    }
    if let Some(profile) = &cmd.profile {
        args.push("--profile".into());
        args.push(profile.clone());
    }
    cwd
}
