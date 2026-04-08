use crate::db::Db;
use crate::error::AppResult;
use crate::models::{ActivityItem, WorkspaceSummary};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct ActivityService {
    db: Arc<Db>,
}

impl ActivityService {
    pub fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn recent(&self, workspace: &WorkspaceSummary, limit: usize) -> AppResult<Vec<ActivityItem>> {
        let mut items = Vec::new();

        for gap in &workspace.readiness_gaps {
            items.push(ActivityItem {
                id: Uuid::new_v4().to_string(),
                item_type: "warning".into(),
                message: gap.message.clone(),
                timestamp: workspace.imported_at,
                link: None,
            });
        }

        for event in self.db.list_events(&workspace.id)? {
            let item_type = match event.kind.as_str() {
                "runStarted" => "run_started",
                "runFinished" => {
                    if matches!(
                        event
                            .payload
                            .get("status")
                            .and_then(|value| value.as_str())
                            .unwrap_or_default(),
                        "pass" | "passed" | "succeeded" | "success"
                    ) {
                        "run_passed"
                    } else {
                        "run_failed"
                    }
                }
                _ => "warning",
            };
            let message = match event.kind.as_str() {
                "runStarted" => "Fozzy run started".to_string(),
                "runFinished" => {
                    let status = event
                        .payload
                        .get("status")
                        .and_then(|value| value.as_str())
                        .unwrap_or("unknown");
                    format!("Fozzy run finished with status {status}")
                }
                _ => format!("Backend event: {}", event.kind),
            };
            items.push(ActivityItem {
                id: event.id,
                item_type: item_type.into(),
                message,
                timestamp: event.at,
                link: event.run_id.map(|run_id| format!("/runs/{run_id}")),
            });
        }

        if items.is_empty() {
            items.push(ActivityItem {
                id: Uuid::new_v4().to_string(),
                item_type: "scan_complete".into(),
                message: format!(
                    "Project scan complete for {}: {} scenarios found",
                    workspace.name, workspace.scenario_count
                ),
                timestamp: Utc::now(),
                link: None,
            });
        }

        items.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
        items.truncate(limit);
        Ok(items)
    }
}
