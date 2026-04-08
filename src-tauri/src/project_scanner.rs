use crate::error::AppResult;
use crate::models::{ReadinessGap, RepoMetadata, ScanSummary, ScenarioSummary};
use chrono::{DateTime, Utc};
use git2::Repository;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct ProjectScan {
    pub summary: ScanSummary,
    pub repo: RepoMetadata,
    pub readiness_gaps: Vec<ReadinessGap>,
    pub scenarios: Vec<ScenarioSummary>,
}

pub struct ProjectScanner;

impl ProjectScanner {
    pub fn scan(root: &Path) -> AppResult<ProjectScan> {
        let mut summary = ScanSummary::default();
        let mut scenarios = Vec::new();

        for entry in WalkDir::new(root).max_depth(4).into_iter().flatten() {
            if entry.file_type().is_dir() {
                continue;
            }
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            if relative == "fozzy.toml" {
                summary.config_path = Some(relative.clone());
            }
            if relative.starts_with(".fozzy") {
                summary.hidden_paths.push(relative.clone());
            }
            if relative.contains("corpora") {
                summary.corpus_paths.push(relative.clone());
            }
            if is_trace_path(&relative) {
                summary.trace_paths.push(relative.clone());
            }
            if is_scenario_path(&relative) {
                summary.scenario_paths.push(relative.clone());
                scenarios.push(ScenarioSummary {
                    path: relative.clone(),
                    kind: detect_kind(&relative),
                    title: title_from_path(&relative),
                    last_modified_at: modified_at(path),
                });
            }
            if relative.contains("artifact")
                || (relative.contains("profile") && relative.ends_with(".json"))
            {
                summary.artifact_paths.push(relative);
            }
        }

        let repo = repo_metadata(root)?;
        let mut readiness_gaps = Vec::new();
        if summary.config_path.is_none() {
            readiness_gaps.push(ReadinessGap {
                code: "missing_config".into(),
                message: "Workspace is missing fozzy.toml".into(),
                severity: "warning".into(),
            });
        }
        if scenarios.is_empty() {
            readiness_gaps.push(ReadinessGap {
                code: "missing_scenarios".into(),
                message: "No Fozzy scenarios were discovered during import".into(),
                severity: "warning".into(),
            });
        }
        if !repo.is_repo {
            readiness_gaps.push(ReadinessGap {
                code: "not_git_repo".into(),
                message: "Imported folder is not a Git repository".into(),
                severity: "info".into(),
            });
        }

        Ok(ProjectScan {
            summary,
            repo,
            readiness_gaps,
            scenarios,
        })
    }

    pub fn counts_by_kind(scenarios: &[ScenarioSummary]) -> serde_json::Value {
        let mut counts = BTreeMap::<String, usize>::new();
        for scenario in scenarios {
            *counts.entry(scenario.kind.clone()).or_default() += 1;
        }
        serde_json::to_value(counts).unwrap_or_default()
    }
}

fn is_scenario_path(path: &str) -> bool {
    if path.starts_with(".fozzy/") || path.contains("/.fozzy/") {
        return false;
    }
    if is_trace_path(path) {
        return false;
    }
    path.ends_with(".fozzy.json")
}

fn is_trace_path(path: &str) -> bool {
    path.contains("trace") || path.ends_with(".trace.fozzy") || path.ends_with(".fozzytrace")
}

fn repo_metadata(root: &Path) -> AppResult<RepoMetadata> {
    let repo = match Repository::discover(root) {
        Ok(repo) => repo,
        Err(_) => {
            return Ok(RepoMetadata {
                is_repo: false,
                branch: None,
                head: None,
                remote: None,
                dirty: false,
            });
        }
    };
    let head = repo.head().ok();
    let branch = head
        .as_ref()
        .and_then(|head| head.shorthand().map(ToOwned::to_owned));
    let revision = head
        .as_ref()
        .and_then(|head| head.target())
        .map(|target| target.to_string());
    let remote = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(ToOwned::to_owned));
    let dirty = repo
        .statuses(None)
        .map(|statuses| !statuses.is_empty())
        .unwrap_or(false);
    Ok(RepoMetadata {
        is_repo: true,
        branch,
        head: revision,
        remote,
        dirty,
    })
}

fn detect_kind(path: &str) -> String {
    if path.contains("memory") {
        "memory".into()
    } else if path.contains("fuzz") {
        "fuzz".into()
    } else if path.contains("explore") {
        "explore".into()
    } else if path.contains("host") {
        "host".into()
    } else if path.contains("trace") {
        "trace".into()
    } else {
        "run".into()
    }
}

fn title_from_path(path: &str) -> String {
    PathBuf::from(path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn modified_at(path: &Path) -> Option<DateTime<Utc>> {
    path.metadata()
        .ok()
        .and_then(|meta| meta.modified().ok())
        .map(DateTime::<Utc>::from)
}
