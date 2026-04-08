use crate::error::AppResult;
use crate::models::ArtifactSummary;
use chrono::{DateTime, Utc};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Clone, Default)]
pub struct ArtifactService;

impl ArtifactService {
    pub fn list(workspace_id: &str, root: &Path) -> AppResult<Vec<ArtifactSummary>> {
        let mut artifacts = Vec::new();
        for entry in WalkDir::new(root).max_depth(6).into_iter().flatten() {
            if entry.file_type().is_dir() {
                continue;
            }
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            if !is_artifact_path(&relative) {
                continue;
            }
            let metadata = path.metadata().ok();
            artifacts.push(ArtifactSummary {
                workspace_id: workspace_id.to_string(),
                path: relative,
                kind: artifact_kind(
                    path.strip_prefix(root)
                        .unwrap_or(path)
                        .to_string_lossy()
                        .as_ref(),
                ),
                size_bytes: metadata.as_ref().map(|item| item.len()).unwrap_or(0),
                modified_at: metadata
                    .and_then(|item| item.modified().ok())
                    .map(DateTime::<Utc>::from),
            });
        }
        artifacts.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
        Ok(artifacts)
    }
}

fn is_artifact_path(path: &str) -> bool {
    path.contains("artifact")
        || path.contains("trace")
        || (path.contains("profile") && path.ends_with(".json"))
        || path.ends_with(".trace.fozzy")
        || path.ends_with(".fozzytrace")
}

fn artifact_kind(path: &str) -> String {
    if path.contains("trace") {
        "trace".into()
    } else if path.contains("profile") {
        "profile".into()
    } else {
        "artifact".into()
    }
}
