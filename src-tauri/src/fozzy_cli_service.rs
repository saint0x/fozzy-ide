use crate::error::AppResult;
use crate::models::{
    CliResultEnvelope, CommonFozzyOptions, FozzyCommand, FozzyCommandRequest, MapCommand,
    ScenarioArgCommand, ScenarioListCommand,
};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Instant;
use tokio::process::Command;

#[derive(Clone, Default)]
pub struct FozzyCliService;

pub struct PreparedCliCommand {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

impl FozzyCliService {
    pub fn prepare(
        &self,
        workspace_root: &Path,
        request: &FozzyCommandRequest,
    ) -> PreparedCliCommand {
        let (command, mut args, cwd) = build_args(workspace_root, &request.command);
        args.insert(0, command.clone());
        PreparedCliCommand { command, args, cwd }
    }

    pub async fn execute(
        &self,
        workspace_root: &Path,
        request: &FozzyCommandRequest,
    ) -> AppResult<CliResultEnvelope> {
        let prepared = self.prepare(workspace_root, request);
        let started = Instant::now();
        let output = Command::new("fozzy")
            .args(&prepared.args)
            .current_dir(&prepared.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;
        Ok(self.finalize(prepared, &output.stdout, &output.stderr, output.status.code(), output.status.success(), started.elapsed().as_millis()))
    }

    pub fn finalize(
        &self,
        prepared: PreparedCliCommand,
        stdout: &[u8],
        stderr: &[u8],
        exit_code: Option<i32>,
        command_succeeded: bool,
        duration_ms: u128,
    ) -> CliResultEnvelope {
        let stdout_text = String::from_utf8_lossy(stdout).to_string();
        let stderr_text = String::from_utf8_lossy(stderr).to_string();
        let stdout_json = serde_json::from_slice(stdout).ok();
        CliResultEnvelope {
            command: prepared.command,
            args: prepared.args,
            cwd: prepared.cwd.to_string_lossy().to_string(),
            status: canonical_run_status(stdout_json.as_ref(), exit_code, command_succeeded),
            exit_code,
            stdout_json,
            stdout_text,
            stderr_text,
            duration_ms,
        }
    }
}

pub(crate) fn canonical_run_status(
    stdout_json: Option<&Value>,
    exit_code: Option<i32>,
    command_succeeded: bool,
) -> String {
    if let Some(status) = stdout_json
        .and_then(extract_status)
        .and_then(normalize_status)
    {
        return status.to_string();
    }

    match exit_code {
        Some(0) => "pass".into(),
        Some(1) => "fail".into(),
        Some(2) => "error".into(),
        Some(3) => "timeout".into(),
        Some(4) => "crash".into(),
        Some(_) => "error".into(),
        None if command_succeeded => "pass".into(),
        None => "crash".into(),
    }
}

fn extract_status(value: &Value) -> Option<&str> {
    value
        .get("status")
        .and_then(Value::as_str)
        .or_else(|| value.get("summary").and_then(extract_status))
        .or_else(|| value.get("result").and_then(extract_status))
}

fn normalize_status(status: &str) -> Option<&'static str> {
    let normalized = status.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "pass" | "passed" | "succeeded" | "success" => Some("pass"),
        "fail" | "failed" => Some("fail"),
        "error" => Some("error"),
        "timeout" | "timedout" | "timed_out" => Some("timeout"),
        "crash" | "crashed" => Some("crash"),
        "cancelled" | "canceled" => Some("cancelled"),
        "running" => Some("running"),
        _ => None,
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
