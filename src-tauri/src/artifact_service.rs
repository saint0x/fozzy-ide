use crate::error::AppResult;
use crate::models::ArtifactSummary;
use chrono::{DateTime, Utc};
use std::path::Path;

#[derive(Clone, Default)]
pub struct ArtifactService;

impl ArtifactService {
    pub fn list(
        workspace_id: &str,
        root: &Path,
        artifact_paths: &[String],
    ) -> AppResult<Vec<ArtifactSummary>> {
        let mut artifacts = Vec::new();
        for relative in artifact_paths {
            let path = root.join(relative);
            let metadata = path.metadata().ok();
            artifacts.push(ArtifactSummary {
                workspace_id: workspace_id.to_string(),
                path: relative.clone(),
                kind: artifact_kind(relative),
                size_bytes: metadata.as_ref().map(|item| item.len()).unwrap_or(0),
                modified_at: metadata
                    .and_then(|item| item.modified().ok())
                    .map(DateTime::<Utc>::from),
            });
        }
        Ok(artifacts)
    }
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
