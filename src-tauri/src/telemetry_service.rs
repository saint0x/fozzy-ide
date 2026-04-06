use crate::db::Db;
use crate::error::AppResult;
use crate::models::{TelemetryPoint, TelemetrySeries};
use chrono::Utc;
use std::sync::Arc;

#[derive(Clone)]
pub struct TelemetryService {
    db: Arc<Db>,
}

impl TelemetryService {
    pub fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn series(&self, workspace_id: &str, metric: &str) -> AppResult<TelemetrySeries> {
        let events = self.db.list_events(workspace_id)?;
        let mut points = Vec::new();
        for event in &events {
            if let Some(value) = event.payload.get(metric).and_then(|value| value.as_f64()) {
                points.push(TelemetryPoint {
                    ts: event.at,
                    value,
                    label: Some(event.kind.clone()),
                });
            } else if metric == "runs" && event.kind == "runFinished" {
                points.push(TelemetryPoint {
                    ts: event.at,
                    value: 1.0,
                    label: event.run_id.clone(),
                });
            }
        }
        if points.is_empty() {
            points.push(TelemetryPoint {
                ts: Utc::now(),
                value: 0.0,
                label: Some("empty".into()),
            });
        }
        Ok(TelemetrySeries {
            workspace_id: workspace_id.to_string(),
            metric: metric.to_string(),
            points,
        })
    }
}
